import { h } from './dom.js';
import { openModal } from './modal.js';
import { state, addPrompt, updatePrompt, addCategory } from '../store.js';
import { flattenFolders } from '../lib/sort.js';
import { extractVars } from '../lib/vars.js';

/** Create/edit modal. `prompt` = existing prompt to edit; `folderId` = default folder for new ones. */
export function openPromptModal({ prompt = null, folderId = null } = {}) {
  const title = h('input', { class: 'field', type: 'text', placeholder: 'e.g. Explain like I’m five', value: prompt?.title ?? '', maxLength: 120 });
  const body = h('textarea', { class: 'field area', rows: 7, placeholder: 'The text that will be pasted. Use {variables} like “tell me about {random topic}”. Escape a brace with \\{ }.' });
  body.value = prompt?.body ?? '';
  const chips = h('div', { class: 'var-chips' });
  const updateChips = () => {
    const vars = extractVars(body.value);
    chips.replaceChildren(...(vars.length
      ? [h('span', { class: 'hint' }, 'Variables:'), ...vars.map((v) => h('span', { class: 'chip var' }, `{${v}}`))]
      : [h('span', { class: 'hint' }, 'No variables – pastes instantly.')]));
  };
  body.addEventListener('input', updateChips); updateChips();

  const catSel = h('select', { class: 'field' },
    h('option', { value: '' }, 'No category'),
    state.categories.map((c) => h('option', { value: c.id, selected: prompt?.category === c.id }, c.name)),
    h('option', { value: '__new__' }, '＋ New category…'));
  const newCat = h('input', { class: 'field', type: 'text', placeholder: 'New category name', hidden: true });
  catSel.addEventListener('change', () => { newCat.hidden = catSel.value !== '__new__'; if (!newCat.hidden) newCat.focus(); });

  const platform = h('input', { class: 'field', type: 'text', placeholder: 'e.g. ChatGPT, Claude', list: 'platform-list', value: prompt?.platform ?? '' });
  const platforms = [...new Set(state.prompts.map((p) => p.platform).filter(Boolean))];
  const platformList = h('datalist', { id: 'platform-list' }, platforms.map((p) => h('option', { value: p })));

  const targetFolder = prompt ? prompt.folderId : folderId;
  const folderSel = h('select', { class: 'field' }, h('option', { value: '' }, 'No folder (top level)'),
    flattenFolders(state).map((f) => h('option', { value: f.id, selected: f.id === targetFolder }, ' '.repeat(f.depth) + f.name)));

  const save = () => {
    const t = title.value.trim();
    if (!t || !body.value.trim()) {
      (!t ? title : body).classList.add('invalid'); (!t ? title : body).focus();
      setTimeout(() => { title.classList.remove('invalid'); body.classList.remove('invalid'); }, 900);
      return;
    }
    let category = catSel.value || null;
    if (category === '__new__') category = newCat.value.trim() ? addCategory(newCat.value).id : null;
    const data = { title: t, body: body.value, category, platform: platform.value.trim(), folderId: folderSel.value || null };
    if (prompt) updatePrompt(prompt.id, data); else addPrompt(data);
    modal.close();
  };

  const form = h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('label', {}, h('span', { class: 'lbl' }, 'Title'), title),
    h('label', {}, h('span', { class: 'lbl' }, 'Prompt'), body, chips),
    h('div', { class: 'row2' },
      h('label', {}, h('span', { class: 'lbl' }, 'Category ', h('em', {}, 'optional')), catSel, newCat),
      h('label', {}, h('span', { class: 'lbl' }, 'Platform ', h('em', {}, 'optional')), platform, platformList)),
    h('label', {}, h('span', { class: 'lbl' }, 'Folder'), folderSel));
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });

  const modal = openModal({
    title: prompt ? 'Edit prompt' : 'New prompt', className: 'prompt-modal', body: form,
    footer: h('div', { class: 'modal-foot' },
      h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, prompt ? 'Save' : 'Create')),
  });
  setTimeout(() => title.focus(), 60);
}
