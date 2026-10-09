const DEFAULT_RAIL = [
    "images/AD-1.JPG",
    "images/AD-2.PNG",
    "images/AD-3.png",
    "images/publicaccess.gif",
    "https://d2w9rnfcy7mm78.cloudfront.net/6431323/original_366950bc1e8702e21c413b0ba4e43fef.jpg?1583967729?bc=0"
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
        title: "Episode 8 — SEM",
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
    const panel = document.getElementById('rail-editor');
    const fields = panel.querySelectorAll('[data-rail-input]');
    fields.forEach((input, i) => { input.value = DEFAULT_RAIL[i]; });
}

function setMediaTab(name) {
    document.querySelectorAll('.media-tab').forEach((btn) => {
        const on = btn.dataset.media === name;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const showVideo = name === 'video';
    const videoPanel = document.querySelector('[data-panel="video"]');
    const chatPanel = document.querySelector('[data-panel="chat"]');
    if (videoPanel) videoPanel.hidden = !showVideo;
    if (chatPanel) chatPanel.hidden = !showVideo;

    document.querySelectorAll('.media-placeholder').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== name;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const title = document.getElementById('video-title');
    const desc = document.getElementById('video-desc');
    const frame = document.getElementById('video-frame');
    if (title) title.textContent = SITE_DATA.video.title;
    if (desc) desc.textContent = SITE_DATA.video.desc;
    if (frame) frame.src = SITE_DATA.video.embed;

    renderRail(loadRailImages());

    const editBtn = document.getElementById('edit-rail-btn');
    if (editBtn) editBtn.addEventListener('click', openRailEditor);

    const form = document.getElementById('rail-editor-form');
    if (form) form.addEventListener('submit', applyRailEditor);

    const cancel = document.getElementById('rail-editor-cancel');
    if (cancel) cancel.addEventListener('click', closeRailEditor);

    const reset = document.getElementById('rail-editor-reset');
    if (reset) reset.addEventListener('click', resetRailImages);

    document.querySelectorAll('.media-tab').forEach((btn) => {
        btn.addEventListener('click', () => setMediaTab(btn.dataset.media));
    });
});
