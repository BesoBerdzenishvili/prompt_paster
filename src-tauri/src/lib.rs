//! Prompt Paster – Rust backend.
//!
//! Responsibilities: global shortcut, tray, window show/hide/placement, desktop
//! blur effects, clipboard + simulated paste, JSON persistence/export/import.
//! The UI (src/) is a plain ES-module frontend that talks to these commands.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicIsize, Ordering},
        mpsc, Mutex,
    },
    thread,
    time::Duration,
};

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    window::{Effect, EffectsBuilder},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const DEFAULT_SHORTCUT: &str = "Alt+W";

// ───────────────────────── state ─────────────────────────

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Device {
    shortcut: String,
    export_path: Option<String>,
}

impl Default for Device {
    fn default() -> Self {
        Self { shortcut: DEFAULT_SHORTCUT.into(), export_path: None }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceInfo {
    shortcut: String,
    export_path: Option<String>,
    shortcut_error: Option<String>,
    os: &'static str,
    version: String,
    data_dir: String,
    autostart: bool,
}

struct AppState {
    device: Mutex<Device>,
    hide_on_blur: AtomicBool,
    pinned: AtomicBool,
    suppress_blur: AtomicBool,
    /// Last foreign (other app) foreground window – used to hand focus back after pasting while pinned.
    prev_focus: AtomicIsize,
    /// Mouse position (physical px) captured when the hotkey fired – usually
    /// right where the user clicked into the target input field.
    anchor: Mutex<Option<(f64, f64)>>,
    shortcut_error: Mutex<Option<String>>,
}

// ───────────────────────── focus helpers ─────────────────────────

/// Remember / restore the window the user was typing in (needed when the list stays open while pinned).
#[cfg(target_os = "windows")]
mod winfocus {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow};

    /// Foreground window if it belongs to another process.
    pub fn foreign_foreground() -> Option<isize> {
        unsafe {
            let h = GetForegroundWindow();
            let raw = h as isize;
            if raw == 0 {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(h, &mut pid);
            if pid == std::process::id() { None } else { Some(raw) }
        }
    }

    pub fn restore(raw: isize) {
        unsafe {
            SetForegroundWindow(raw as _);
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod winfocus {
    pub fn foreign_foreground() -> Option<isize> {
        None
    }
    pub fn restore(_raw: isize) {}
}

fn remember_foreground(app: &AppHandle) {
    if let Some(h) = winfocus::foreign_foreground() {
        app.state::<AppState>().prev_focus.store(h, Ordering::SeqCst);
    }
}

// ───────────────────────── helpers ─────────────────────────

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, contents).map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

fn save_device(app: &AppHandle, device: &Device) -> Result<(), String> {
    let json = serde_json::to_string_pretty(device).map_err(|e| e.to_string())?;
    write_atomic(&data_dir(app)?.join("device.json"), &json)
}

/// Returns the stored device settings and whether this is the first run.
fn load_device(app: &AppHandle) -> (Device, bool) {
    let path = data_dir(app).map(|d| d.join("device.json"));
    match path.ok().and_then(|p| fs::read_to_string(p).ok()) {
        Some(text) => (serde_json::from_str(&text).unwrap_or_default(), false),
        None => (Device::default(), true),
    }
}

fn monitor_at(w: &WebviewWindow, x: f64, y: f64) -> Option<tauri::Monitor> {
    w.available_monitors().ok()?.into_iter().find(|m| {
        let p = m.position();
        let s = m.size();
        x >= p.x as f64 && x < (p.x + s.width as i32) as f64 && y >= p.y as f64 && y < (p.y + s.height as i32) as f64
    })
}

fn show_main(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let state = app.state::<AppState>();
    let cursor = app.cursor_position().ok();
    *state.anchor.lock().unwrap() = cursor.map(|c| (c.x, c.y));

    let monitor = cursor
        .and_then(|c| monitor_at(&w, c.x, c.y))
        .or_else(|| w.current_monitor().ok().flatten());
    match (monitor, w.outer_size()) {
        (Some(m), Ok(size)) => {
            let (mp, ms) = (m.position(), m.size());
            let x = mp.x + (ms.width as i32 - size.width as i32) / 2;
            let y = mp.y + (ms.height as i32 - size.height as i32) / 2;
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
        _ => {
            let _ = w.center();
        }
    }
    remember_foreground(app);
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to("main", "window:shown", ());
}

fn toggle_main(app: &AppHandle) {
    if let Some(v) = app.get_webview_window("vars") {
        if v.is_visible().unwrap_or(false) {
            let _ = v.hide();
            return;
        }
    }
    match app.get_webview_window("main") {
        Some(w) if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) => {
            let _ = w.hide();
        }
        Some(_) => show_main(app),
        None => {}
    }
}

fn hide_all(app: &AppHandle) {
    for label in ["main", "vars"] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.hide();
        }
    }
}

/// Puts the small variables box just below the remembered mouse anchor
/// (flipping above it / clamping so it always stays on screen).
fn place_vars(app: &AppHandle, height_phys: Option<f64>) {
    let Some(v) = app.get_webview_window("vars") else { return };
    let anchor = *app.state::<AppState>().anchor.lock().unwrap();
    let anchor = anchor.or_else(|| app.cursor_position().ok().map(|c| (c.x, c.y)));
    let (Some((ax, ay)), Ok(size)) = (anchor, v.outer_size()) else {
        let _ = v.center();
        return;
    };
    let scale = v.scale_factor().unwrap_or(1.0);
    let (w, h) = (size.width as f64, height_phys.unwrap_or(size.height as f64));
    let gap = 20.0 * scale;
    let mut x = ax - 24.0 * scale;
    let mut y = ay + gap;
    if let Some(m) = monitor_at(&v, ax, ay) {
        let (mp, ms) = (m.position(), m.size());
        let (left, top) = (mp.x as f64, mp.y as f64);
        let (right, bottom) = (left + ms.width as f64, top + ms.height as f64);
        if y + h > bottom {
            y = ay - h - gap;
        }
        x = x.min(right - w - 8.0).max(left + 8.0);
        y = y.min(bottom - h - 8.0).max(top + 8.0);
    }
    let _ = v.set_position(PhysicalPosition::new(x as i32, y as i32));
}

// ───────────────────────── paste ─────────────────────────

fn press_paste() -> Result<(), String> {
    let mut input = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;
    // On Windows use the raw virtual-key code of "V" so layouts never matter.
    #[cfg(target_os = "windows")]
    let v = Key::Other(0x56);
    #[cfg(not(target_os = "windows"))]
    let v = Key::Unicode('v');

    input.key(modifier, Direction::Press).map_err(|e| e.to_string())?;
    let clicked = input.key(v, Direction::Click).map_err(|e| e.to_string());
    input.key(modifier, Direction::Release).map_err(|e| e.to_string())?;
    clicked
}

fn do_paste(app: &AppHandle, text: &str, restore: bool, refocus: Option<isize>) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let previous = if restore { clipboard.get_text().ok() } else { None };
    clipboard.set_text(text.to_string()).map_err(|e| e.to_string())?;

    // Pinned: the list stays open, so explicitly give focus back to the app the user was typing in.
    if let Some(h) = refocus {
        winfocus::restore(h);
    }
    // Give the OS a moment to hand focus back to the previously active window.
    thread::sleep(Duration::from_millis(160));

    // Keyboard simulation must run on the main thread on macOS.
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(press_paste());
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(3)).map_err(|e| e.to_string())??;

    // Keep the clipboard alive (required on X11) until the target app has read it.
    thread::sleep(Duration::from_millis(400));
    if let Some(prev) = previous {
        let _ = clipboard.set_text(prev);
    }
    Ok(())
}

// ───────────────────────── commands ─────────────────────────

#[tauri::command]
fn get_device(app: AppHandle, state: State<'_, AppState>) -> DeviceInfo {
    let device = state.device.lock().unwrap().clone();
    DeviceInfo {
        shortcut: device.shortcut,
        export_path: device.export_path,
        shortcut_error: state.shortcut_error.lock().unwrap().clone(),
        os: std::env::consts::OS,
        version: app.package_info().version.to_string(),
        data_dir: data_dir(&app).map(|d| d.display().to_string()).unwrap_or_default(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
    }
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join("data.json");
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_data(app: AppHandle, state: State<'_, AppState>, json: String, auto_export: bool) -> Result<(), String> {
    write_atomic(&data_dir(&app)?.join("data.json"), &json)?;
    if auto_export {
        let path = state.device.lock().unwrap().export_path.clone();
        if let Some(p) = path {
            write_atomic(Path::new(&p), &json)?;
        }
    }
    Ok(())
}

/// Writes the export file. `choose` (or no remembered path) asks for a location.
#[tauri::command]
async fn export_data(
    app: AppHandle,
    state: State<'_, AppState>,
    json: String,
    choose: bool,
) -> Result<Option<String>, String> {
    let remembered = state.device.lock().unwrap().export_path.clone();
    let path = match (choose, remembered) {
        (false, Some(p)) => PathBuf::from(p),
        _ => {
            state.suppress_blur.store(true, Ordering::SeqCst);
            let picked = app
                .dialog()
                .file()
                .add_filter("JSON", &["json"])
                .set_file_name("prompt-paster-data.json")
                .blocking_save_file();
            state.suppress_blur.store(false, Ordering::SeqCst);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
            match picked {
                Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
                None => return Ok(None),
            }
        }
    };
    write_atomic(&path, &json)?;
    let mut device = state.device.lock().unwrap();
    device.export_path = Some(path.display().to_string());
    save_device(&app, &device)?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
async fn import_data(app: AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.suppress_blur.store(true, Ordering::SeqCst);
    let picked = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file();
    state.suppress_blur.store(false, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
    match picked {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn set_shortcut(app: AppHandle, state: State<'_, AppState>, shortcut: String) -> Result<String, String> {
    let new: Shortcut = shortcut.parse().map_err(|e| format!("Invalid shortcut: {e}"))?;
    let gs = app.global_shortcut();
    let old = state.device.lock().unwrap().shortcut.clone();
    if let Ok(o) = old.parse::<Shortcut>() {
        let _ = gs.unregister(o);
    }
    if let Err(e) = gs.register(new) {
        if let Ok(o) = old.parse::<Shortcut>() {
            let _ = gs.register(o);
        }
        return Err(format!("Could not register {shortcut}: {e}"));
    }
    *state.shortcut_error.lock().unwrap() = None;
    let mut device = state.device.lock().unwrap();
    device.shortcut = shortcut.clone();
    save_device(&app, &device)?;
    Ok(shortcut)
}

/// While the user records a new shortcut the old one must not fire.
#[tauri::command]
fn pause_shortcut(app: AppHandle) {
    let _ = app.global_shortcut().unregister_all();
}

#[tauri::command]
fn resume_shortcut(app: AppHandle, state: State<'_, AppState>) {
    let sc = state.device.lock().unwrap().shortcut.clone();
    if let Ok(s) = sc.parse::<Shortcut>() {
        let _ = app.global_shortcut().register(s);
    }
}

#[tauri::command]
async fn paste_text(app: AppHandle, text: String, restore: bool, prompt_id: Option<String>) -> Result<(), String> {
    let (pinned, prev) = {
        let st = app.state::<AppState>();
        (st.pinned.load(Ordering::SeqCst), st.prev_focus.load(Ordering::SeqCst))
    };
    if pinned {
        // Keep the main list open; only the small variables box goes away.
        if let Some(v) = app.get_webview_window("vars") {
            let _ = v.hide();
        }
    } else {
        hide_all(&app);
    }
    let refocus = if pinned && prev != 0 { Some(prev) } else { None };
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || do_paste(&handle, &text, restore, refocus))
        .await
        .map_err(|e| e.to_string())??;
    if let Some(id) = prompt_id {
        let _ = app.emit_to("main", "prompt:used", id);
    }
    Ok(())
}

/// Step 1 of the variables flow: hide the list and hand the data to the small box.
#[tauri::command]
fn show_vars(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    if !app.state::<AppState>().pinned.load(Ordering::SeqCst) {
        if let Some(m) = app.get_webview_window("main") {
            let _ = m.hide();
        }
    }
    app.emit_to("vars", "vars:open", payload).map_err(|e| e.to_string())
}

/// Step 2: the box measured itself – resize, place near the input and show it.
#[tauri::command]
fn present_vars(app: AppHandle, height: f64) {
    let Some(v) = app.get_webview_window("vars") else { return };
    let scale = v.scale_factor().unwrap_or(1.0);
    let anchor = *app.state::<AppState>().anchor.lock().unwrap();
    let monitor = anchor
        .and_then(|(x, y)| monitor_at(&v, x, y))
        .or_else(|| v.current_monitor().ok().flatten());
    // As tall as the content needs, but never taller than the screen (the list scrolls then).
    let max_h = monitor.map(|m| m.size().height as f64 / scale - 48.0).unwrap_or(700.0).max(160.0);
    let h = height.clamp(120.0, max_h);
    let _ = v.set_size(LogicalSize::new(340.0, h));
    place_vars(&app, Some(h * scale));
    let _ = v.show();
    let _ = v.set_focus();
}

#[tauri::command]
fn hide_windows(app: AppHandle) {
    hide_all(&app);
}

#[tauri::command]
fn set_behavior(state: State<'_, AppState>, hide_on_blur: bool) {
    state.hide_on_blur.store(hide_on_blur, Ordering::SeqCst);
}

#[tauri::command]
fn set_pinned(app: AppHandle, state: State<'_, AppState>, pinned: bool) {
    state.pinned.store(pinned, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_always_on_top(pinned);
    }
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let launcher = app.autolaunch();
    (if enabled { launcher.enable() } else { launcher.disable() }).map_err(|e| e.to_string())
}

/// Enables/disables the native "desktop blur" behind the transparent windows.
#[tauri::command]
fn apply_glass(app: AppHandle, enabled: bool) {
    for label in ["main", "vars"] {
        let Some(w) = app.get_webview_window(label) else { continue };
        #[cfg(target_os = "windows")]
        {
            let cfg = if enabled { Some(EffectsBuilder::new().effect(Effect::Acrylic).build()) } else { None };
            let _ = w.set_effects(cfg);
        }
        #[cfg(target_os = "macos")]
        {
            let cfg = if enabled {
                Some(EffectsBuilder::new().effect(Effect::HudWindow).state(tauri::window::EffectState::Active).radius(18.0).build())
            } else {
                None
            };
            let _ = w.set_effects(cfg);
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            // Linux: blur-behind is compositor specific and not exposed by Tauri.
            let _ = (&w, enabled, EffectsBuilder::new(), Effect::Acrylic, tauri::window::EffectState::Active);
        }
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ───────────────────────── entry ─────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == "main" || window.label() == "vars" => {
                remember_foreground(window.app_handle());
                if window.label() != "main" {
                    return;
                }
                let st = window.app_handle().state::<AppState>();
                if st.hide_on_blur.load(Ordering::SeqCst)
                    && !st.pinned.load(Ordering::SeqCst)
                    && !st.suppress_blur.load(Ordering::SeqCst)
                {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let (device, first_run) = load_device(&handle);

            let mut shortcut_error = None;
            match device.shortcut.parse::<Shortcut>() {
                Ok(sc) => {
                    if let Err(e) = handle.global_shortcut().register(sc) {
                        shortcut_error = Some(format!("{} is already in use by another app ({e})", device.shortcut));
                    }
                }
                Err(e) => shortcut_error = Some(format!("Invalid shortcut {}: {e}", device.shortcut)),
            }

            app.manage(AppState {
                device: Mutex::new(device),
                hide_on_blur: AtomicBool::new(true),
                pinned: AtomicBool::new(false),
                suppress_blur: AtomicBool::new(false),
                prev_focus: AtomicIsize::new(0),
                anchor: Mutex::new(None),
                shortcut_error: Mutex::new(shortcut_error),
            });

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Run in the background on startup (skipped for dev builds).
            if first_run && !cfg!(debug_assertions) {
                let _ = handle.autolaunch().enable();
            }

            let open = MenuItem::with_id(app, "open", "Open Prompt Paster", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("tray")
                .tooltip("Prompt Paster")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_device,
            load_data,
            save_data,
            export_data,
            import_data,
            set_shortcut,
            pause_shortcut,
            resume_shortcut,
            paste_text,
            show_vars,
            present_vars,
            hide_windows,
            set_behavior,
            set_pinned,
            set_autostart,
            apply_glass,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Prompt Paster");
}
