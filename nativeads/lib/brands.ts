import type { Brand } from "./types";

/**
 * Household-name brands everyone instantly recognizes — the easy wins for a
 * product-placement demo. Each carries a distinct, on-brand signal color used
 * across selection, branching, and previews. (Replit + zfellows added for fun.)
 *
 * Note: real trademarks, used here illustratively in a non-shipping demo.
 */
// `product` + `logo` are the ad direction Kling sees: a recognizable hero
// product and a description of the brand mark so the generated cut reads
// unmistakably as that brand (see buildPrompt in lib/generation.ts).
export const BRANDS: Brand[] = [
  { id: "cocacola", name: "Coca-Cola", category: "Beverage", tagline: "Taste the feeling", color: "#F40009",
    product: "an ice-cold glass bottle of Coca-Cola beaded with condensation",
    logo: "the white Coca-Cola Spencerian script wordmark on its bright red label",
    productImage: "/products/cocacola.png" },
  { id: "pepsi", name: "Pepsi", category: "Beverage", tagline: "That's what I like", color: "#2B6FD6",
    product: "a frosty can of Pepsi",
    logo: "the red, white and blue Pepsi globe with the lowercase 'pepsi' wordmark",
    productImage: "/products/pepsi.png" },
  { id: "mcdonalds", name: "McDonald's", category: "Food", tagline: "I'm lovin' it", color: "#FFC72C",
    product: "a McDonald's meal — a burger and fries in red-and-yellow branded packaging",
    logo: "the bright golden arches 'M'" },
  { id: "nike", name: "Nike", category: "Footwear", tagline: "Just do it", color: "#F5F5F5",
    product: "a pair of Nike sneakers",
    logo: "the white Nike swoosh on the side" },
  { id: "apple", name: "Apple", category: "Devices", tagline: "Think different", color: "#9BA1A6",
    product: "an Apple iPhone with its sleek glass-and-aluminium body",
    logo: "the clean, minimalist Apple logo (a bitten-apple silhouette) centered on the back" },
  { id: "spotify", name: "Spotify", category: "Music", tagline: "Music for everyone", color: "#1DB954",
    product: "a smartphone running the Spotify app, now playing a track",
    logo: "the green Spotify circle with three curved sound bars" },
  { id: "tiffany", name: "Tiffany & Co.", category: "Jewelry", tagline: "Timeless by design", color: "#0ABAB5",
    product: "a Tiffany Blue gift box tied with a white satin ribbon",
    logo: "the 'TIFFANY & CO.' wordmark on the lid" },
  { id: "discord", name: "Discord", category: "Social", tagline: "Talk, hang out", color: "#5865F2",
    product: "a phone showing the Discord app on its blurple interface",
    logo: "the white Discord game-controller mascot on a blurple field" },
  { id: "twitch", name: "Twitch", category: "Streaming", tagline: "You're already live", color: "#9146FF",
    product: "a screen showing a live Twitch stream",
    logo: "the purple Twitch glitch speech-bubble logo with the 'Twitch' wordmark" },
  { id: "tmobile", name: "T-Mobile", category: "Telecom", tagline: "The Un-carrier", color: "#E20074",
    product: "a smartphone in a vivid magenta T-Mobile-branded setting",
    logo: "the magenta 'T' logo with the 'T-Mobile' wordmark" },
  { id: "replit", name: "Replit", category: "Developer", tagline: "Just start coding", color: "#F26207",
    product: "a laptop open to the Replit coding workspace",
    logo: "the orange Replit logo with the 'Replit' wordmark" },
  { id: "zfellows", name: "zfellows", category: "Fellowship", tagline: "Apply in 30 seconds", color: "#18C8E6",
    product: "a laptop open to the zfellows site",
    logo: "the cyan 'zfellows' wordmark" },
];

export const brandById = (id: string) => BRANDS.find((b) => b.id === id);
