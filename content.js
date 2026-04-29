const SITE_DATA = {
    // Links for the nav and ads
    links: {
        twitter: "https://x.com/yourprofile",
        youtube: "https://youtube.com/c/yourchannel",
        shop: "#",
        privacy: "#"
    },
    // Images for the 1/7 Carousel
    carousel: [
        "https://picsum.photos/id/10/200/300",
        "https://picsum.photos/id/20/200/300",
        "https://picsum.photos/id/30/200/300",
        "https://picsum.photos/id/40/200/300",
        "https://picsum.photos/id/50/200/300",
        "https://picsum.photos/id/60/200/300",
        "https://picsum.photos/id/70/200/300"
    ]
};

let currentImgIndex = 0;

function updateCarousel(direction) {
    currentImgIndex = (currentImgIndex + direction + SITE_DATA.carousel.length) % SITE_DATA.carousel.length;
    document.getElementById('carousel-img').src = SITE_DATA.carousel[currentImgIndex];
    document.getElementById('carousel-counter').innerText = `${currentImgIndex + 1}/7`;
}