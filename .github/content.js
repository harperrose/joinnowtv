const SITE_DATA = {
    links: {
        twitter: "https://x.com/yourprofile",
        youtube: "https://www.youtube.com/@ooukfunkyoo",
        shop: "/shop",
        guestbook: "/api/comments" // Or a 3rd party link
    },
    ads: {
        gifAdUrl: "https://media.giphy.com/media/example/giphy.gif",
        buySemLink: "#buy"
    }
};

// Function to inject content
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('[data-content]').forEach(el => {
        const key = el.getAttribute('data-content');
        if (SITE_DATA.links[key]) el.href = SITE_DATA.links[key];
    });
});
