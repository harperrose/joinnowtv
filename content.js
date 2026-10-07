const DEFAULT_RAIL = [
    "https://d2w9rnfcy7mm78.cloudfront.net/6431323/original_366950bc1e8702e21c413b0ba4e43fef.jpg?1583967729?bc=0",
    "https://d2w9rnfcy7mm78.cloudfront.net/16464435/original_66e2f0b19761f8dbed5f09dd84fcbdd1.jpg?1652549774?bc=0",
    "https://d2w9rnfcy7mm78.cloudfront.net/15648911/original_6f7630be095417f8b28f8ab4bf767b3e.jpg?1647640496?bc=0",
    "https://d2w9rnfcy7mm78.cloudfront.net/15648938/original_4f724f1842e943858838c5715404ecc9.jpg?1647640668?bc=0",
    "https://d2w9rnfcy7mm78.cloudfront.net/29009179/original_9a9e71920be59e4b74b2b17070549f60.gif?1719336017?bc=0"
];

const RAIL_KEY = 'joinnowtv_rail_images';

const SITE_DATA = {
    links: {
        instagram: "https://x.com/yourprofile",
        youtube: "https://youtube.com/c/yourchannel",
        shop: "#",
        privacy: "#"
    },
    video: {
        embed: "https://www.youtube.com/embed/7E7cN5-5jbE",
        title: "Episode 8 - SEM",
        desc: "Video description and whatnot"
    }
};

function loadRailImages() {
    try {
        const saved = JSON.parse(localStorage.getItem(RAIL_KEY) || 'null');
        if (Array.isArray(saved) && saved.length === 5 && saved.every((u) => typeof u === 'string' && u.trim())) {
            return saved.map((u) => u.trim());
        }
    } catch (_) { /* ignore */ }
    return [...DEFAULT_RAIL];
}

function saveRailImages(urls) {
    localStorage.setItem(RAIL_KEY, JSON.stringify(urls));
}

function renderRail(urls) {
    const rail = document.getElementById('image-rail');
    if (!rail) return;
    rail.innerHTML = '';
    urls.forEach((src, i) => {
        const fig = document.createElement('figure');
        fig.className = 'rail-slot';
        fig.innerHTML = `
            <img src="${src}" alt="Rail ${i + 1}" loading="lazy">
            <figcaption>${i + 1}/5</figcaption>
        `;
        rail.appendChild(fig);
    });
}

function openRailEditor() {
    const urls = loadRailImages();
    const panel = document.getElementById('rail-editor');
    const fields = panel.querySelectorAll('[data-rail-input]');
    fields.forEach((input, i) => { input.value = urls[i] || ''; });
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
}

function closeRailEditor() {
    const panel = document.getElementById('rail-editor');
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
}

function applyRailEditor(event) {
    event.preventDefault();
    const panel = document.getElementById('rail-editor');
    const fields = [...panel.querySelectorAll('[data-rail-input]')];
    const urls = fields.map((input, i) => input.value.trim() || DEFAULT_RAIL[i]);
    saveRailImages(urls);
    renderRail(urls);
    closeRailEditor();
}

function resetRailImages() {
    localStorage.removeItem(RAIL_KEY);
    renderRail(DEFAULT_RAIL);
    closeRailEditor();
}

function sendChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    const wall = document.getElementById('chat-wall');
    const line = document.createElement('p');
    const id = String(Math.floor(Math.random() * 90) + 10).padStart(2, '0');
    line.innerHTML = `<span class="user-id">[USER_${id}]:</span> ${escapeHtml(text)}`;
    wall.appendChild(line);
    wall.scrollTop = wall.scrollHeight;
    input.value = '';
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    renderRail(loadRailImages());

    const editBtn = document.getElementById('edit-rail-btn');
    if (editBtn) editBtn.addEventListener('click', openRailEditor);

    const form = document.getElementById('rail-editor-form');
    if (form) form.addEventListener('submit', applyRailEditor);

    const cancel = document.getElementById('rail-editor-cancel');
    if (cancel) cancel.addEventListener('click', closeRailEditor);

    const reset = document.getElementById('rail-editor-reset');
    if (reset) reset.addEventListener('click', resetRailImages);

    const chatForm = document.getElementById('chat-form');
    if (chatForm) chatForm.addEventListener('submit', sendChatMessage);
});
