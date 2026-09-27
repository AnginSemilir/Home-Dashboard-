// The shopping list, kept in Google Tasks. (Google Keep has no API a web page can use on a
// personal account; Tasks does, with the same Google sign-in.)

export const TASKS = 'https://www.googleapis.com/tasks/v1';
const enc = encodeURIComponent;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function listTaskLists(google) {
  const b = await google.api(`${TASKS}/users/@me/lists?maxResults=100`);
  return (b?.items || []).map((l) => ({ id: l.id, name: l.title || 'Untitled' }));
}

export async function createTaskList(google, title = 'Shopping') {
  const b = await google.api(`${TASKS}/users/@me/lists`, json('POST', { title }));
  return { id: b.id, name: b.title };
}

/** Items still to buy, in the list's own order. */
export function parseItems(items) {
  return (items || [])
    .filter((t) => t && t.status !== 'completed' && !t.deleted && !t.hidden && String(t.title || '').trim())
    .sort((a, b) => String(a.position || '').localeCompare(String(b.position || '')))
    .map((t) => ({ id: t.id, title: String(t.title).trim() }));
}

export async function fetchItems(google, listId) {
  const b = await google.api(`${TASKS}/lists/${enc(listId)}/tasks?showCompleted=false&showHidden=false&maxResults=100`);
  return parseItems(b?.items);
}

/** Tick an item off (done = true) or put it back (done = false). */
export function setDone(google, listId, id, done = true) {
  return google.api(`${TASKS}/lists/${enc(listId)}/tasks/${enc(id)}`, json('PATCH', done ? { status: 'completed' } : { status: 'needsAction', completed: null }));
}

export function addItem(google, listId, title) {
  const t = String(title || '').trim();
  if (!t) throw new Error('Type something to add');
  return google.api(`${TASKS}/lists/${enc(listId)}/tasks`, json('POST', { title: t.slice(0, 1024) }));
}
