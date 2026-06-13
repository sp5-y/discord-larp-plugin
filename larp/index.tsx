// larp tool - vencord userplugin, client side only

import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import ErrorBoundary from "@components/ErrorBoundary";
import { copyWithToast } from "@utils/discord";
import { RenderModalProps, User } from "@vencord/discord-types";
import type { Embed, Message } from "@vencord/discord-types";
import { waitFor, filters, findByCodeLazy, findByPropsLazy } from "@webpack";
import {
    AuthenticationStore, ConnectedAccount, Constants, FluxDispatcher,
    openModal, Modal, TextInput, Checkbox, Button, Forms, Text,
    DisplayProfileUtils, ScrollerThin, UserProfileStore, UserStore,
    UsernameUtils, useStateFromStores, TabBar, useState, useRef, useEffect,
    showToast, Toasts, SearchableSelect, RestAPI, MessageStore, Parser,
} from "@webpack/common";

interface BadgeEntry {
    id: string;
    description: string;
    icon: string;
    link?: string;
}

interface LarpCustomConnection {
    id: string;
    type: string;
    name: string;
}

function getCurrentUserId() {
    return AuthenticationStore.getId();
}

function connKey(c: ConnectedAccount) {
    return `${c.type}:${c.id}`;
}

function connectionTypeLabel(type: string) {
    return type.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function connectionNeedsDomain(type: string) {
    return type === "domain";
}

function normalizeDomain(input?: string) {
    if (!input) return "";
    return input.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

const CONNECTION_TYPE_OPTIONS = [
    "amazon-music", "battlenet", "bluesky", "bungie", "crunchyroll", "domain",
    "ebay", "epicgames", "facebook", "github", "instagram", "leagueoflegends",
    "mastodon", "paypal", "playstation", "reddit", "riotgames", "roblox",
    "samsung", "skype", "soundcloud", "spotify", "steam", "tiktok",
    "twitch", "twitter", "xbox", "youtube",
].map(type => ({ value: type, label: connectionTypeLabel(type) }));

function buildFakeConnection(c: LarpCustomConnection): ConnectedAccount | null {
    const id = c.id || `larp-${c.type}-${Date.now()}`;

    if (c.type === "domain") {
        const domain = normalizeDomain(c.name);
        if (!domain) return null;
        return { type: "domain", id, name: domain, verified: true };
    }

    const handle = c.name.trim();
    if (!handle) return null;

    return {
        type: c.type as ConnectedAccount["type"],
        id,
        name: handle,
        verified: true,
    };
}

function getRealConnections() {
    const userId = getCurrentUserId() ?? "";
    if (!userId) return [] as ConnectedAccount[];
    return origGetUserProfile?.(userId)?.connectedAccounts ?? [];
}

async function refreshOwnProfile() {
    const userId = getCurrentUserId();
    if (!userId) return;

    try {
        const { body } = await RestAPI.get({
            url: Constants.Endpoints.USER_PROFILE(userId),
            query: { with_mutual_guilds: false, with_mutual_friends_count: false },
            oldFormErrors: true,
        });

        FluxDispatcher.dispatch({ type: "USER_UPDATE", user: body.user });
        await FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_SUCCESS", userProfile: body });
    } catch { }
}

const UserFlags = Constants.UserFlags as Record<string, number>;

// badge icons from mezotv repo
const BADGE_ASSETS_BASE = "https://raw.githubusercontent.com/mezotv/discord-badges/main/assets";

const NITRO_TIERS = ["bronze", "silver", "gold", "platinum", "diamond", "emerald", "ruby", "opal"] as const;

const BADGE_ICON_MAP: Record<string, string> = {
    staff: "discordstaff.svg",
    partner: "discordpartner.svg",
    certified_moderator: "discordmod.svg",
    hypesquad: "hypesquadevents.svg",
    hypesquad_house_1: "hypesquadbravery.svg",
    hypesquad_house_2: "hypesquadbrilliance.svg",
    hypesquad_house_3: "hypesquadbalance.svg",
    bug_hunter_level_1: "discordbughunter1.svg",
    bug_hunter_level_2: "discordbughunter2.svg",
    active_developer: "activedeveloper.svg",
    verified_developer: "discordbotdev.svg",
    early_supporter: "discordearlysupporter.svg",
    premium: "subscriptions/badges/bronze.png",
    premium_early_supporter: "discordearlysupporter.svg",
    quest_completed: "quest.png",
    quest: "quest.png",
    legacy_username: "username.png",
    supports_commands: "supportscommands.svg",
    automod: "automod.svg",
    orb: "orb.svg",
    ...Object.fromEntries(NITRO_TIERS.map(t => [`premium_${t}`, `subscriptions/badges/${t}.png`])),
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [
        `guild_booster_lvl${i + 1}`,
        `boosts/discordboost${i + 1}.svg`,
    ])),
};

const KNOWN_BADGES: Record<string, { description: string; icon: string; link?: string }> = {
    staff: { description: "Discord Staff", icon: "discordstaff.svg", link: "https://discord.com/company" },
    partner: { description: "Partnered Server Owner", icon: "discordpartner.svg", link: "https://discord.com/partners" },
    certified_moderator: { description: "Moderator Programs Alumni", icon: "discordmod.svg", link: "https://discord.com/safety" },
    hypesquad: { description: "HypeSquad Events", icon: "hypesquadevents.svg", link: "https://discord.com/hypesquad" },
    hypesquad_house_1: { description: "HypeSquad Bravery", icon: "hypesquadbravery.svg", link: "https://discord.com/settings/hypesquad-online" },
    hypesquad_house_2: { description: "HypeSquad Brilliance", icon: "hypesquadbrilliance.svg", link: "https://discord.com/settings/hypesquad-online" },
    hypesquad_house_3: { description: "HypeSquad Balance", icon: "hypesquadbalance.svg", link: "https://discord.com/settings/hypesquad-online" },
    bug_hunter_level_1: { description: "Discord Bug Hunter", icon: "discordbughunter1.svg", link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs" },
    bug_hunter_level_2: { description: "Discord Bug Hunter (Gold)", icon: "discordbughunter2.svg", link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs" },
    active_developer: { description: "Active Developer", icon: "activedeveloper.svg", link: "https://support-dev.discord.com/hc/en-us/articles/10113997751447" },
    verified_developer: { description: "Early Verified Bot Developer", icon: "discordbotdev.svg" },
    early_supporter: { description: "Early Supporter", icon: "discordearlysupporter.svg", link: "https://discord.com/settings/premium" },
    premium: { description: "Discord Nitro (Bronze)", icon: "subscriptions/badges/bronze.png", link: "https://discord.com/settings/premium" },
    premium_bronze: { description: "Nitro Bronze", icon: "subscriptions/badges/bronze.png", link: "https://discord.com/settings/premium" },
    premium_silver: { description: "Nitro Silver", icon: "subscriptions/badges/silver.png", link: "https://discord.com/settings/premium" },
    premium_gold: { description: "Nitro Gold", icon: "subscriptions/badges/gold.png", link: "https://discord.com/settings/premium" },
    premium_platinum: { description: "Nitro Platinum", icon: "subscriptions/badges/platinum.png", link: "https://discord.com/settings/premium" },
    premium_diamond: { description: "Nitro Diamond", icon: "subscriptions/badges/diamond.png", link: "https://discord.com/settings/premium" },
    premium_emerald: { description: "Nitro Emerald", icon: "subscriptions/badges/emerald.png", link: "https://discord.com/settings/premium" },
    premium_ruby: { description: "Nitro Ruby", icon: "subscriptions/badges/ruby.png", link: "https://discord.com/settings/premium" },
    premium_opal: { description: "Nitro Opal", icon: "subscriptions/badges/opal.png", link: "https://discord.com/settings/premium" },
    guild_booster_lvl1: { description: "Server Booster (1 month)", icon: "boosts/discordboost1.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl2: { description: "Server Booster (2 months)", icon: "boosts/discordboost2.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl3: { description: "Server Booster (3 months)", icon: "boosts/discordboost3.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl4: { description: "Server Booster (6 months)", icon: "boosts/discordboost4.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl5: { description: "Server Booster (9 months)", icon: "boosts/discordboost5.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl6: { description: "Server Booster (12 months)", icon: "boosts/discordboost6.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl7: { description: "Server Booster (15 months)", icon: "boosts/discordboost7.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl8: { description: "Server Booster (18 months)", icon: "boosts/discordboost8.svg", link: "https://discord.com/settings/premium" },
    guild_booster_lvl9: { description: "Server Booster (24+ months)", icon: "boosts/discordboost9.svg", link: "https://discord.com/settings/premium" },
    quest_completed: { description: "Quest Completed", icon: "quest.png" },
    quest: { description: "Quest Completed", icon: "quest.png" },
    legacy_username: { description: "Legacy Username Badge", icon: "username.png" },
    supports_commands: { description: "Supports Commands", icon: "supportscommands.svg" },
    automod: { description: "AutoMod", icon: "automod.svg" },
    orb: { description: "Orb", icon: "orb.svg" },
};

const FLAG_BADGE_IDS: Record<string, string> = {
    active_developer: "active_developer",
    bug_hunter_level_1: "bug_hunter_level_1",
    bug_hunter_level_2: "bug_hunter_level_2",
    certified_moderator: "certified_moderator",
    discord_employee: "staff",
    hypesquad: "hypesquad",
    hypesquad_online_house_1: "hypesquad_house_1",
    hypesquad_online_house_2: "hypesquad_house_2",
    hypesquad_online_house_3: "hypesquad_house_3",
    partner: "partner",
    premium_early_supporter: "early_supporter",
    verified_developer: "verified_developer",
};

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable Larp Tool",
        default: true,
        restartNeeded: false,
    },
    openManager: {
        type: OptionType.COMPONENT,
        component: () => (
            <>
                <Forms.FormText>Ctrl+B to open.</Forms.FormText>
                <Button onClick={openBadgeManager} size="small" style={{ marginTop: 8 }}>
                    Open Larp Tool
                </Button>
            </>
        ),
    },
    hiddenBadges: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    addedBadges: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    customUsername: {
        type: OptionType.STRING,
        default: "",
    },
    connectionOverrides: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, { name?: string }>,
    },
    hiddenConnections: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    customConnections: {
        type: OptionType.CUSTOM,
        default: [] as LarpCustomConnection[],
    },
});

const useLegacyPlatformType: (platform: string) => string = findByCodeLazy(".TWITTER_LEGACY:");
const connectionPlatforms: { get(type: string): { icon: { lightSVG: string; darkSVG: string; }; getPlatformUserUrl?(c: ConnectedAccount): string; }; } = findByPropsLazy("isSupported", "getByUrl");
const unpatchFns: (() => void)[] = [];

// discord cdn hashes for hiding badges when runtime id is wrong
const DISCORD_ICON_HASHES: Record<string, string> = {
    active_developer: "6bdc42827a38498929a4920da12695d9",
    bug_hunter_level_1: "2717692c7dca7289b35297368a940dd0",
    bug_hunter_level_2: "848f79194d4be5ff5f81505cbd0ce1e6",
    certified_moderator: "fee1624003e2fee35cb398e125dc479b",
    staff: "5e74e9b61934fc1f67c65515d1f7e60d",
    discord_employee: "5e74e9b61934fc1f67c65515d1f7e60d",
    hypesquad: "bf01d1073931f921909045f3a39fd264",
    hypesquad_house_1: "8a88d63823d8a71cd5e390baa45efa02",
    hypesquad_house_2: "011940fd013da3f7fb926e4a1cd2e618",
    hypesquad_house_3: "3aa41de486fa12454c3761e8e223442e",
    partner: "3f9748e53446a137a052f3454e2de41e",
    premium: "2ba85e8026a8614b640c2837bcdfe21b",
    premium_bronze: "2ba85e8026a8614b640c2837bcdfe21b",
    early_supporter: "7060786766c9c840eb3019e725d2b358",
    premium_early_supporter: "7060786766c9c840eb3019e725d2b358",
    verified_developer: "6df5892e0f35b051f8b61eace34f4967",
};

let unfilteredGetBadges: ((this: { userId: string }) => Array<{
    id?: string;
    key?: string;
    icon?: string;
    iconSrc?: string;
}>) | null = null;

let origGetUserProfile: typeof UserProfileStore.getUserProfile;
let origGetCurrentUser: typeof UserStore.getCurrentUser;
let origGetUser: typeof UserStore.getUser;
let origGetMessage: typeof MessageStore.getMessage;
let origGetMessages: typeof MessageStore.getMessages;
let origParserParse: typeof Parser.parse;
let cachedRealUsername = "";
const wrappedMessageCache = new Map<string, Message>();
const usernameProxyCache = new WeakMap<User, User>();
const displayProfileProxyCache = new WeakMap<object, unknown>();
const messageCollectionProxyCache = new WeakMap<object, ReturnType<typeof MessageStore.getMessages>>();
const wrappedProfileCache = new WeakMap<object, { gen: number; value: NonNullable<ReturnType<typeof UserProfileStore.getUserProfile>>; }>();
let profileWrapGeneration = 0;
let messageCollectionGeneration = 0;
let hiddenBadgeSetCache: Set<string> | null = null;
let hiddenBadgeSetCacheKey = "";

interface UsernameSwapCtx {
    active: boolean;
    real: string;
    custom: string;
}

let usernameSwapCtx: UsernameSwapCtx = { active: false, real: "", custom: "" };
let badgeProfileUserId: string | undefined;

const HIDDEN_BADGE_STYLE_ID = "vc-larp-tool-hidden-badges";
const LARP_EXPORT_VERSION = 1;

const ModalTabs = { Username: 0, Badges: 1, Connections: 2, Data: 3 } as const;

interface LarpExportData {
    version?: number;
    name?: string;
    customUsername?: string;
    hiddenBadges?: string[];
    addedBadges?: string[];
    connectionOverrides?: Record<string, { name?: string }>;
    hiddenConnections?: string[];
    customConnections?: LarpCustomConnection[];
}

const cardStyle = {
    padding: "10px 12px",
    borderRadius: 10,
    background: "var(--background-tertiary)",
    border: "1px solid var(--background-modifier-accent)",
};

const connectionRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 10,
    background: "var(--background-tertiary)",
    border: "1px solid var(--background-modifier-accent)",
};

const sectionTitleStyle = {
    margin: "0 0 10px",
    color: "var(--header-secondary)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
};

function getLarpExportData(): LarpExportData {
    return {
        version: LARP_EXPORT_VERSION,
        customUsername: settings.store.customUsername,
        hiddenBadges: [...settings.store.hiddenBadges],
        addedBadges: [...settings.store.addedBadges],
        connectionOverrides: { ...settings.store.connectionOverrides },
        hiddenConnections: [...settings.store.hiddenConnections],
        customConnections: settings.store.customConnections.map(c => ({ ...c })),
    };
}

function applyLarpExportData(data: LarpExportData) {
    settings.store.customUsername = typeof data.customUsername === "string" ? data.customUsername.slice(0, 32) : "";
    settings.store.hiddenBadges = Array.isArray(data.hiddenBadges)
        ? data.hiddenBadges.filter(x => typeof x === "string")
        : [];
    settings.store.addedBadges = Array.isArray(data.addedBadges)
        ? data.addedBadges.filter(x => typeof x === "string")
        : [];
    settings.store.connectionOverrides = data.connectionOverrides && typeof data.connectionOverrides === "object"
        ? { ...data.connectionOverrides }
        : {};
    settings.store.hiddenConnections = Array.isArray(data.hiddenConnections)
        ? data.hiddenConnections.filter(x => typeof x === "string")
        : [];
    settings.store.customConnections = Array.isArray(data.customConnections)
        ? data.customConnections.filter(c => c?.id && c?.type).map(c => ({
            id: String(c.id),
            type: String(c.type),
            name: typeof c.name === "string" ? c.name : "",
        }))
        : [];
    updateHiddenBadgeStyles();
    triggerProfileRefresh();
}

function parseLarpImport(raw: string): LarpExportData | null {
    try {
        const data = JSON.parse(raw) as LarpExportData;
        if (!data || typeof data !== "object") return null;
        if (data.version != null && data.version !== LARP_EXPORT_VERSION) return null;
        return data;
    } catch {
        return null;
    }
}

function resetLarpConfig() {
    applyLarpExportData({
        customUsername: "",
        hiddenBadges: [],
        addedBadges: [],
        connectionOverrides: {},
        hiddenConnections: [],
        customConnections: [],
    });
}

function getRawUserProfile(userId: string) {
    return origGetUserProfile?.(userId) ?? UserProfileStore.getUserProfile(userId);
}

const badgeInjector: ProfileBadge = {
    position: BadgePosition.START,
    shouldShow: ({ userId }) => settings.store.enabled && userId === getCurrentUserId(),
    getBadges: () => settings.store.addedBadges
        .map(id => {
            const known = KNOWN_BADGES[id];
            const iconSrc = resolveBadgeIcon(id, known?.icon);
            if (!iconSrc) return null;

            return {
                id,
                key: `vc-custom-${id}`,
                description: known?.description ?? id.replace(/_/g, " "),
                iconSrc,
                link: known?.link,
            };
        })
        .filter((badge): badge is NonNullable<typeof badge> => badge !== null),
};

function badgeIconUrl(icon: string) {
    if (!icon) return "";
    if (icon.startsWith("http")) return icon;
    if (icon.includes("/") || /\.(svg|png|webp)$/i.test(icon)) {
        return `${BADGE_ASSETS_BASE}/${icon}`;
    }
    return `https://cdn.discordapp.com/badge-icons/${icon}.png?size=96`;
}

function resolveBadgeIcon(id: string, fallbackIcon?: string) {
    if (BADGE_ICON_MAP[id]) return badgeIconUrl(BADGE_ICON_MAP[id]);

    const boost = id.match(/^guild_booster_lvl(\d+)$/);
    if (boost) return badgeIconUrl(`boosts/discordboost${boost[1]}.svg`);

    const nitro = id.match(/^premium_(bronze|silver|gold|platinum|diamond|emerald|ruby|opal)$/);
    if (nitro) return badgeIconUrl(`subscriptions/badges/${nitro[1]}.png`);

    if (id === "premium" || id.startsWith("premium_tenure")) {
        return badgeIconUrl("subscriptions/badges/bronze.png");
    }

    if (id.includes("quest")) return badgeIconUrl("quest.png");

    if (fallbackIcon) return badgeIconUrl(fallbackIcon);
    if (KNOWN_BADGES[id]?.icon) return badgeIconUrl(KNOWN_BADGES[id].icon);

    return "";
}

function isVencordBadge(id: string) {
    return id.startsWith("vencord_") || id.startsWith("vc-") || id.startsWith("vc-custom-");
}

const BADGE_ALIAS_GROUPS = [ // discord loves duplicate ids for the same badge
    ["quest", "quest_completed"],
    ["staff", "discord_employee"],
    ["premium", "premium_bronze", "premium_subscriber"],
    ["early_supporter", "premium_early_supporter"],
    ["hypesquad_house_1", "hypesquad_online_house_1"],
    ["hypesquad_house_2", "hypesquad_online_house_2"],
    ["hypesquad_house_3", "hypesquad_online_house_3"],
    ["verified_developer", "verified_bot_developer"],
    ["bug_hunter_level_1", "bug_hunter"],
    ["bug_hunter_level_2", "bug_hunter_gold"],
];

function getBadgeKey(badge: { id?: string; key?: string; }) {
    return badge.id ?? badge.key ?? "";
}

function getBadgeIconHash(badge: { icon?: string; iconSrc?: string; }) {
    if (badge.icon && !badge.icon.includes("/") && !badge.icon.includes(".")) return badge.icon;

    const src = badge.iconSrc ?? (badge.icon?.startsWith("http") ? badge.icon : null);
    if (!src) return null;

    return src.match(/badge-icons\/([a-f0-9]+)/i)?.[1]
        ?? src.match(/\/([a-f0-9]{32})\./i)?.[1]
        ?? null;
}

function hideKey(kind: "icon" | "url", val: string) {
    return kind === "icon" ? `icon:${val}` : `url:${val}`;
}

function getBadgeImageUrls(badge: { icon?: string; iconSrc?: string; }) {
    const urls = new Set<string>();
    if (badge.iconSrc) urls.add(badge.iconSrc);

    const hash = getBadgeIconHash(badge);
    if (hash) {
        urls.add(`https://cdn.discordapp.com/badge-icons/${hash}.png`);
        urls.add(`https://cdn.discordapp.com/badge-icons/${hash}.webp`);
    }

    return [...urls];
}

function expandBadgeHideIds(id: string): string[] {
    const result = new Set<string>([id]);

    for (const group of BADGE_ALIAS_GROUPS) {
        if (group.includes(id)) group.forEach(alias => result.add(alias));
    }

    const userId = getCurrentUserId();
    if (!userId) return [...result];

    const idIcon = BADGE_ICON_MAP[id] ?? KNOWN_BADGES[id]?.icon;

    for (const badge of getRawUserProfile(userId)?.badges ?? []) {
        const bid = getBadgeKey(badge);
        if (!bid) continue;

        if (idIcon && (BADGE_ICON_MAP[bid] ?? KNOWN_BADGES[bid]?.icon) === idIcon) result.add(bid);
        if (id.includes("quest") && bid.includes("quest")) result.add(bid);
        if (id.startsWith("premium") && bid.startsWith("premium")) result.add(bid);
        if (id.startsWith("guild_booster") && bid.startsWith("guild_booster")) result.add(bid);

        const hash = getBadgeIconHash(badge);
        const idHash = DISCORD_ICON_HASHES[id];
        if (hash && idHash && hash === idHash) result.add(bid);
    }

    for (const alias of [...result]) {
        const hash = DISCORD_ICON_HASHES[alias];
        if (hash) result.add(hideKey("icon", hash));
    }

    return [...result];
}

function getHiddenBadgeSet() {
    const key = settings.store.hiddenBadges.join("\0");
    if (hiddenBadgeSetCache && key === hiddenBadgeSetCacheKey) return hiddenBadgeSetCache;

    hiddenBadgeSetCacheKey = key;
    hiddenBadgeSetCache = new Set<string>();
    for (const id of settings.store.hiddenBadges) {
        for (const expanded of expandBadgeHideIds(id)) hiddenBadgeSetCache.add(expanded);
    }
    return hiddenBadgeSetCache;
}

function invalidateHiddenBadgeCache() {
    hiddenBadgeSetCache = null;
}

function isBadgeHiddenKey(key: string) {
    const hidden = getHiddenBadgeSet();
    if (hidden.has(key)) return true;

    if (key.startsWith("icon:")) return hidden.has(key);

    const keyHash = DISCORD_ICON_HASHES[key];
    if (keyHash && hidden.has(hideKey("icon", keyHash))) return true;

    const keyIcon = BADGE_ICON_MAP[key] ?? KNOWN_BADGES[key]?.icon;
    if (keyIcon) {
        for (const hid of hidden) {
            const hidIcon = BADGE_ICON_MAP[hid] ?? KNOWN_BADGES[hid]?.icon;
            if (hidIcon === keyIcon) return true;
        }
    }

    if (key.includes("quest") && [...hidden].some(h => h.includes("quest"))) return true;
    if (key.startsWith("premium") && [...hidden].some(h => h.startsWith("premium"))) return true;
    if (key.startsWith("guild_booster") && [...hidden].some(h => h.startsWith("guild_booster"))) return true;

    return false;
}

function isBadgeHiddenObject(badge: { id?: string; key?: string; icon?: string; iconSrc?: string; }) {
    const key = getBadgeKey(badge);
    if (key && isBadgeHiddenKey(key)) return true;

    const hash = getBadgeIconHash(badge);
    if (hash && getHiddenBadgeSet().has(hideKey("icon", hash))) return true;

    if (hash) {
        for (const hid of settings.store.hiddenBadges) {
            const knownHash = DISCORD_ICON_HASHES[hid];
            if (knownHash === hash) return true;
        }
    }

    return false;
}

function getLiveNativeBadges() {
    const userId = getCurrentUserId();
    if (!userId) return [] as Array<{ id?: string; key?: string; icon?: string; iconSrc?: string; }>;

    try {
        const profile = DisplayProfileUtils.getDisplayProfile(userId);
        if (profile) {
            if (unfilteredGetBadges) return unfilteredGetBadges.call(profile);
            return profile.getBadges?.() ?? [];
        }
    } catch { }

    return getRawUserProfile(userId)?.badges ?? [];
}

function getUnfilteredOwnedBadges() {
    const userId = getCurrentUserId();
    if (!userId) return [] as Array<{ id?: string; key?: string; description?: string; icon?: string; iconSrc?: string; link?: string; }>;

    if (unfilteredGetBadges) {
        try {
            const profile = DisplayProfileUtils.getDisplayProfile(userId);
            if (profile) return unfilteredGetBadges.call(profile);
        } catch { }
    }

    return origGetUserProfile?.(userId)?.badges ?? getRawUserProfile(userId)?.badges ?? [];
}

function captureHiddenIdentifiers(id: string) {
    const ids = new Set(expandBadgeHideIds(id));
    const userId = getCurrentUserId();

    for (const alias of ids) {
        const hash = DISCORD_ICON_HASHES[alias];
        if (hash) ids.add(hideKey("icon", hash));
    }

    if (!userId) return [...ids];

    for (const badge of getRawUserProfile(userId)?.badges ?? []) {
        const bid = getBadgeKey(badge);
        if (!bid) continue;
        if ([...ids].some(hid => expandBadgeHideIds(hid).includes(bid))) {
            ids.add(bid);
            const hash = getBadgeIconHash(badge);
            if (hash) ids.add(hideKey("icon", hash));
            for (const url of getBadgeImageUrls(badge)) ids.add(hideKey("url", url));
        }
    }

    for (const badge of getLiveNativeBadges()) {
        const bid = getBadgeKey(badge);
        if (!bid) continue;
        if ([...ids].some(hid => expandBadgeHideIds(hid).includes(bid))) {
            ids.add(bid);
            const hash = getBadgeIconHash(badge);
            if (hash) ids.add(hideKey("icon", hash));
            for (const url of getBadgeImageUrls(badge)) ids.add(hideKey("url", url));
        }
    }

    return [...ids];
}

function updateHiddenBadgeStyles() {
    let style = document.getElementById(HIDDEN_BADGE_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = HIDDEN_BADGE_STYLE_ID;
        document.head.appendChild(style);
    }

    if (!settings.store.enabled || !settings.store.hiddenBadges.length) {
        style.textContent = "";
        return;
    }

    const userId = getCurrentUserId();
    if (!userId) {
        style.textContent = "";
        return;
    }

    const selectors = new Set<string>();

    for (const entry of settings.store.hiddenBadges) {
        if (entry.startsWith("icon:")) {
            const hash = entry.slice(5);
            selectors.add(`img[src*="badge-icons/${hash}"]`);
            continue;
        }

        if (entry.startsWith("url:")) {
            const url = entry.slice(4);
            selectors.add(`img[src="${url}"]`);
            const tail = url.split("/").pop();
            if (tail) selectors.add(`img[src*="${tail}"]`);
            continue;
        }

        const hash = DISCORD_ICON_HASHES[entry];
        if (hash) selectors.add(`img[src*="badge-icons/${hash}"]`);

        const asset = BADGE_ICON_MAP[entry] ?? KNOWN_BADGES[entry]?.icon;
        if (asset) selectors.add(`img[src*="${asset.split("/").pop()}"]`);
    }

    const scope = `[data-user-id="${userId}"]`;
    style.textContent = [...selectors]
        .map(sel => `${scope} ${sel}, [data-larp-user="${userId}"] ${sel} { display: none !important; }`)
        .join("\n");
}

function wrapDisplayProfile<T extends { userId: string; getBadges(): unknown[]; }>(profile: T | null): T | null {
    if (!profile?.userId || profile.userId !== getCurrentUserId() || !settings.store.enabled) return profile;

    const cached = displayProfileProxyCache.get(profile);
    if (cached) return cached as T;

    const userId = profile.userId;
    const origGetBadges = profile.getBadges.bind(profile);

    const proxy = new Proxy(profile, {
        get(target, prop, receiver) {
            if (prop === "getBadges") {
                return () => filterBadges({ userId }, origGetBadges() as Array<{
                    id?: string;
                    key?: string;
                    icon?: string;
                    iconSrc?: string;
                }>);
            }
            if (prop === "__larpToolWrapped") return true;
            return Reflect.get(target, prop, receiver);
        },
    }) as T;

    displayProfileProxyCache.set(profile, proxy);
    return proxy;
}


function getCustomName() {
    if (!settings.store.enabled) return null;
    const n = settings.store.customUsername.trim();
    return n || null;
}

function withCustomUsernameOnly(user: User | null | undefined): User | null | undefined {
    if (!user?.id || user.id !== getCurrentUserId()) return user;

    const custom = getCustomName();
    if (!custom || user.username === custom) return user;

    const cached = usernameProxyCache.get(user);
    if (cached) return cached;

    const proxy = new Proxy(user, {
        get(target, prop, receiver) {
            if (prop === "username") return custom;
            return Reflect.get(target, prop, receiver);
        },
    }) as User;

    usernameProxyCache.set(user, proxy);
    return proxy;
}

function getAccountSettingsUsername(user: User) {
    if (!settings.store.enabled || user.id !== getCurrentUserId()) return user.username;
    return getCustomName() ?? user.username;
}

function refreshUsernameSwapCtx() {
    const prev = usernameSwapCtx;

    if (!settings.store.enabled) {
        usernameSwapCtx = { active: false, real: "", custom: "" };
    } else {
        const custom = settings.store.customUsername.trim();
        const real = cachedRealUsername || origGetCurrentUser?.()?.username || "";
        usernameSwapCtx = !custom || !real || real === custom
            ? { active: false, real, custom }
            : { active: true, real, custom };
    }

    if (prev.active !== usernameSwapCtx.active || prev.real !== usernameSwapCtx.real || prev.custom !== usernameSwapCtx.custom) {
        wrappedMessageCache.clear();
        messageCollectionGeneration++;
        profileWrapGeneration++;
    }
}

function getRealUsername() {
    if (cachedRealUsername) return cachedRealUsername;
    return origGetCurrentUser?.()?.username ?? "";
}

function swapRealUsernameInText(text: string | null | undefined) {
    if (!text || !usernameSwapCtx.active || !text.includes(usernameSwapCtx.real)) return text ?? "";
    return text.split(usernameSwapCtx.real).join(usernameSwapCtx.custom);
}

function embedMentionsRealUsername(embed: Embed, real: string) {
    if (embed.rawTitle?.includes(real)) return true;
    if (embed.rawDescription?.includes(real)) return true;
    if (embed.author?.name?.includes(real)) return true;
    if (embed.footer?.text?.includes(real)) return true;
    if (embed.provider?.name?.includes(real)) return true;
    return embed.fields?.some(f => f.rawName?.includes(real) || f.rawValue?.includes(real)) ?? false;
}

function messageMentionsRealUsername(message: Message, real: string) {
    if (message.content?.includes(real)) return true;
    if (message.embeds?.some(e => embedMentionsRealUsername(e, real))) return true;
    return message.messageSnapshots?.some(s => s.message && messageMentionsRealUsername(s.message as Message, real)) ?? false;
}

function mapEmbed(embed: Embed): Embed {
    const { active, real } = usernameSwapCtx;
    if (!active || !embedMentionsRealUsername(embed, real)) return embed;

    return {
        ...embed,
        rawTitle: swapRealUsernameInText(embed.rawTitle),
        rawDescription: swapRealUsernameInText(embed.rawDescription),
        author: embed.author ? { ...embed.author, name: swapRealUsernameInText(embed.author.name) } : embed.author,
        footer: embed.footer ? { ...embed.footer, text: swapRealUsernameInText(embed.footer.text) } : embed.footer,
        provider: embed.provider ? { ...embed.provider, name: swapRealUsernameInText(embed.provider.name ?? "") } : embed.provider,
        fields: embed.fields?.map(f => ({
            ...f,
            rawName: swapRealUsernameInText(f.rawName),
            rawValue: swapRealUsernameInText(f.rawValue),
        })) ?? embed.fields,
    };
}

function wrapMessageForDisplay(message: Message | null | undefined): Message | null | undefined {
    if (!message?.id || !usernameSwapCtx.active) return message;

    const { real, custom } = usernameSwapCtx;
    if (!messageMentionsRealUsername(message, real)) return message;

    const cacheKey = `${message.id}:${message.edited_timestamp ?? message.timestamp}:${custom}:${real}`;
    const cached = wrappedMessageCache.get(cacheKey);
    if (cached) return cached;

    const content = swapRealUsernameInText(message.content);
    const embeds = message.embeds?.map(mapEmbed) ?? message.embeds;
    const messageSnapshots = message.messageSnapshots?.map(s => ({
        ...s,
        message: s.message ? wrapMessageForDisplay(s.message as Message) : s.message,
    })) ?? message.messageSnapshots;

    const wrapped = new Proxy(message, {
        get(target, prop, receiver) {
            if (prop === "content") return content;
            if (prop === "embeds") return embeds;
            if (prop === "messageSnapshots") return messageSnapshots;
            return Reflect.get(target, prop, receiver);
        },
    }) as Message;

    wrappedMessageCache.set(cacheKey, wrapped);
    if (wrappedMessageCache.size > 500) {
        wrappedMessageCache.delete(wrappedMessageCache.keys().next().value!);
    }

    return wrapped;
}

function invalidateRuntimeCaches() {
    invalidateHiddenBadgeCache();
    profileWrapGeneration++;
    messageCollectionGeneration++;
    wrappedMessageCache.clear();
    refreshUsernameSwapCtx();
}

function refreshCachedUsername() {
    const user = origGetCurrentUser?.() ?? UserStore.getCurrentUser();
    if (!user?.id || user.id !== getCurrentUserId()) return;

    const custom = getCustomName();
    if (!custom || user.username !== custom) {
        cachedRealUsername = user.username;
    }
    refreshUsernameSwapCtx();
}

function applyLarpConnections(connections: ConnectedAccount[] | undefined) {
    if (!settings.store.enabled) return connections;

    const overrides = settings.store.connectionOverrides;
    const hidden = new Set(settings.store.hiddenConnections ?? []);
    const custom = settings.store.customConnections ?? [];
    const base = connections ?? [];

    if (!base.length && !custom.length && !Object.keys(overrides).length && !hidden.size) return connections;

    const usedTypes = new Set(base.map(c => c.type));

    const mapped = base
        .filter(connection => !hidden.has(connKey(connection)))
        .map(connection => {
            const key = connKey(connection);
            const override = overrides[key] ?? overrides[connection.type];
            const name = override?.name?.trim();
            if (!name) return connection;
            return { ...connection, name };
        });

    for (const cc of custom) {
        if (!cc.type || usedTypes.has(cc.type)) continue;
        const built = buildFakeConnection(cc);
        if (!built) continue;
        mapped.push(built);
        usedTypes.add(cc.type);
    }

    return mapped;
}

function swapUsernameTag(user: User | null | undefined, tag: string) {
    if (!user?.id || user.id !== getCurrentUserId()) return tag;

    const custom = getCustomName();
    if (!custom || typeof tag !== "string") return tag;

    const real = getRealUsername();
    if (real && tag.includes(real)) return tag.replace(real, custom);
    return tag.includes(user.username) ? tag.replace(user.username, custom) : tag;
}

function getNativeBadgeIds(): Set<string> {
    const userId = getCurrentUserId();
    if (!userId) return new Set();

    const ids = new Set<string>();

    for (const badge of getUnfilteredOwnedBadges()) {
        const key = getBadgeKey(badge);
        if (key) ids.add(key);
    }

    for (const badge of origGetUserProfile?.(userId)?.badges ?? getRawUserProfile(userId)?.badges ?? []) {
        const key = getBadgeKey(badge);
        if (key) ids.add(key);
    }

    const user = UserStore.getCurrentUser();
    if (user) {
        for (const [key, flag] of Object.entries(UserFlags)) {
            if (typeof flag !== "number") continue;
            if (!user.hasFlag(flag)) continue;
            const badgeId = FLAG_BADGE_IDS[key.toLowerCase()];
            if (badgeId) ids.add(badgeId);
        }
        if (user.premiumType) ids.add("premium_bronze");
    }

    return ids;
}

function runtimeBadgeToEntry(badge: {
    id?: string;
    key?: string;
    description?: string;
    icon?: string;
    iconSrc?: string;
    link?: string;
}): BadgeEntry | null {
    const id = getBadgeKey(badge);
    if (!id) return null;

    const known = KNOWN_BADGES[id];
    return {
        id,
        description: badge.description ?? known?.description ?? id.replace(/_/g, " "),
        icon: badge.iconSrc?.startsWith("http")
            ? badge.iconSrc
            : BADGE_ICON_MAP[id] ?? known?.icon ?? (badge.icon ?? ""),
        link: badge.link ?? known?.link,
    };
}

function isOwnedBadgeVisible(id: string) {
    return !expandBadgeHideIds(id).some(alias => isBadgeHiddenKey(alias));
}

function isAddedBadgeVisible(id: string) {
    return settings.store.addedBadges.includes(id);
}

function setOwnedBadgeVisible(id: string, visible: boolean) {
    const expanded = captureHiddenIdentifiers(id);
    let hidden = [...settings.store.hiddenBadges];

    if (visible) {
        hidden = hidden.filter(x => !expanded.includes(x));
    } else {
        for (const badgeId of expanded) {
            if (!hidden.includes(badgeId)) hidden.push(badgeId);
        }
    }

    settings.store.hiddenBadges = hidden;
    settings.store.addedBadges = settings.store.addedBadges.filter(x => !expanded.includes(x));
    invalidateHiddenBadgeCache();
    updateHiddenBadgeStyles();
    triggerProfileRefresh();
}

function setAddedBadgeVisible(id: string, visible: boolean) {
    let added = [...settings.store.addedBadges];

    if (visible) {
        if (!added.includes(id)) added.push(id);
    } else {
        added = added.filter(x => x !== id);
    }

    settings.store.addedBadges = added;
    triggerProfileRefresh();
}

function triggerProfileRefresh() {
    invalidateRuntimeCaches();
    const userId = getCurrentUserId();
    const user = UserStore.getCurrentUser();
    if (!user || !userId) return;

    FluxDispatcher.dispatch({ type: "USER_UPDATE", user });

    const profile = origGetUserProfile?.(userId);
    if (profile && settings.store.enabled) {
        FluxDispatcher.dispatch({
            type: "USER_PROFILE_UPDATE",
            userProfile: wrapOwnUserProfile(profile, userId),
        });
    } else if (profile) {
        FluxDispatcher.dispatch({ type: "USER_PROFILE_UPDATE", userProfile: profile });
    }
}

function filterBadges(
    profile: { userId?: string; user?: { id: string; }; },
    badges: Array<{ id?: string; key?: string; }>
) {
    const userId = profile?.userId ?? profile?.user?.id;
    badgeProfileUserId = userId;

    if (!settings.store.enabled) return badges;
    if (!userId || userId !== getCurrentUserId()) return badges;

    return badges.filter(b => {
        const key = getBadgeKey(b);
        if (key && isVencordBadge(key)) return true;
        return !isBadgeHiddenObject(b);
    });
}

function getModalBadgeLists() {
    const ownedIds = getNativeBadgeIds();
    const yours: BadgeEntry[] = [];
    const seen = new Set<string>();
    const addedIds = new Set(settings.store.addedBadges);

    for (const badge of getUnfilteredOwnedBadges()) {
        const entry = runtimeBadgeToEntry(badge);
        if (!entry || seen.has(entry.id) || addedIds.has(entry.id)) continue;
        seen.add(entry.id);
        ownedIds.add(entry.id);
        yours.push(entry);
    }

    const userId = getCurrentUserId() ?? "";
    for (const badge of origGetUserProfile?.(userId)?.badges ?? getRawUserProfile(userId)?.badges ?? []) {
        const entry = runtimeBadgeToEntry(badge);
        if (!entry || seen.has(entry.id) || addedIds.has(entry.id)) continue;
        seen.add(entry.id);
        ownedIds.add(entry.id);
        yours.push(entry);
    }

    for (const id of ownedIds) {
        if (seen.has(id) || addedIds.has(id)) continue;
        seen.add(id);
        const known = KNOWN_BADGES[id];
        yours.push(known
            ? { id, ...known }
            : { id, description: id.replace(/_/g, " "), icon: BADGE_ICON_MAP[id] ?? "" });
    }

    yours.sort((a, b) => a.description.localeCompare(b.description));

    const other = Object.entries(KNOWN_BADGES)
        .filter(([id]) => !ownedIds.has(id))
        .map(([id, def]) => ({ id, ...def }))
        .sort((a, b) => a.description.localeCompare(b.description));

    return { ownedIds, yours, other };
}

function openBadgeManager() { openModal(p => <BadgeModal {...p} />); }

function handleKeyDown(e: KeyboardEvent) {
    if (!settings.store.enabled) return;

    const key = e.key.toLowerCase();
    if (key !== "b" || !(e.ctrlKey || e.metaKey) || e.altKey) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    openBadgeManager();
}

function BadgeRow({ badge, visible, owned, onChange }: {
    badge: BadgeEntry;
    visible: boolean;
    owned: boolean;
    onChange: (visible: boolean) => void;
}) {
    const icon = badge.icon.startsWith("http")
        ? badge.icon
        : resolveBadgeIcon(badge.id, badge.icon) || badgeIconUrl(badge.icon);

    return (
        <div style={{ ...cardStyle, padding: "8px 12px" }}>
            <Checkbox value={visible} onChange={(_, checked) => onChange(checked)} size={20}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        borderRadius: 8,
                        background: "var(--background-secondary)",
                    }}>
                        {icon ? (
                            <img
                                src={icon}
                                alt=""
                                width={24}
                                height={24}
                                onError={e => {
                                    const img = e.currentTarget;
                                    if (!img.dataset.fallback) {
                                        img.dataset.fallback = "1";
                                        img.src = icon.replace(".png", ".webp");
                                    } else {
                                        img.style.display = "none";
                                    }
                                }}
                            />
                        ) : (
                            <div style={{ width: 24, height: 24, borderRadius: 4, background: "var(--background-tertiary)" }} />
                        )}
                    </div>
                    <Text variant="text-sm/medium" style={{ color: "var(--text-normal)" }}>{badge.description}</Text>
                </div>
            </Checkbox>
        </div>
    );
}

function ProfilePreview({ asTitle }: { asTitle?: boolean }) {
    settings.use(["customUsername", "hiddenBadges", "addedBadges"]);
    const user = UserStore.getCurrentUser();
    const { yours, other } = useStateFromStores(
        [UserProfileStore, UserStore],
        () => getModalBadgeLists()
    );

    const handle = settings.store.customUsername.trim() || user?.username || "username";
    const visible = [
        ...yours.filter(b => isOwnedBadgeVisible(b.id)),
        ...other.filter(b => isAddedBadgeVisible(b.id)),
    ];

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            ...(asTitle
                ? { padding: "4px 0 8px", margin: 0 }
                : { ...cardStyle, marginBottom: 16 }),
        }}>
            <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "var(--background-tertiary)",
                backgroundImage: user ? `url(${user.getAvatarURL(undefined, 80, true)})` : undefined,
                backgroundSize: "cover",
                flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <Text variant="text-lg/semibold">@{handle}</Text>
                {visible.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {visible.map(b => {
                            const icon = b.icon.startsWith("http")
                                ? b.icon
                                : resolveBadgeIcon(b.id, b.icon) || badgeIconUrl(b.icon);
                            return icon ? <img key={b.id} src={icon} alt="" width={20} height={20} /> : null;
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function ConnectionPlatformIcon({ type, size = 28 }: { type: string; size?: number }) {
    try {
        const platform = connectionPlatforms.get(useLegacyPlatformType(type));
        if (!platform) return null;

        return (
            <img
                src={platform.icon.darkSVG}
                alt={connectionTypeLabel(type)}
                title={connectionTypeLabel(type)}
                width={size}
                height={size}
                style={{ flexShrink: 0, display: "block" }}
            />
        );
    } catch {
        return (
            <div style={{
                width: size,
                height: size,
                borderRadius: 4,
                background: "var(--background-tertiary)",
                flexShrink: 0,
            }} />
        );
    }
}

function ConnectionRow({ type, value, onChange, placeholder, disabled, actionLabel, onAction }: {
    type: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    actionLabel: string;
    onAction: () => void;
}) {
    return (
        <div style={connectionRowStyle}>
            <ConnectionPlatformIcon type={type} />
            <TextInput
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                style={{ flex: 1, minWidth: 0 }}
            />
            <Button size="tiny" variant="secondary" onClick={onAction}>
                {actionLabel}
            </Button>
        </div>
    );
}

function ConnectionsSection() {
    settings.use(["connectionOverrides", "hiddenConnections", "customConnections"]);
    const [pickType, setPickType] = useState<string | null>(null);
    const [newName, setNewName] = useState("");

    const realConnections = useStateFromStores(
        [UserProfileStore],
        () => getRealConnections()
    );
    const overrides = settings.store.connectionOverrides;
    const hidden = settings.store.hiddenConnections;
    const hiddenSet = new Set(hidden);
    const custom = settings.store.customConnections;

    const usedTypes = new Set([
        ...realConnections.filter(c => !hiddenSet.has(connKey(c))).map(c => c.type),
        ...custom.map(c => c.type),
    ]);
    const availableTypes = CONNECTION_TYPE_OPTIONS.filter(o => !usedTypes.has(o.value));

    const updateOverride = (key: string, value: string) => {
        const next = { ...overrides };
        if (!value.trim()) delete next[key];
        else next[key] = { name: value };
        settings.store.connectionOverrides = next;
        triggerProfileRefresh();
    };

    const hideRealConnection = (key: string) => {
        if (hiddenSet.has(key)) return;
        settings.store.hiddenConnections = [...hidden, key];
        triggerProfileRefresh();
    };

    const restoreRealConnection = (key: string) => {
        settings.store.hiddenConnections = hidden.filter(k => k !== key);
        triggerProfileRefresh();
    };

    const updateCustom = (id: string, name: string) => {
        settings.store.customConnections = custom.map(c =>
            c.id === id ? { ...c, name: connectionNeedsDomain(c.type) ? normalizeDomain(name) : name } : c
        );
        triggerProfileRefresh();
    };

    const removeCustom = (id: string) => {
        settings.store.customConnections = custom.filter(c => c.id !== id);
        triggerProfileRefresh();
    };

    const addCustom = () => {
        if (!pickType) return;
        const name = connectionNeedsDomain(pickType)
            ? normalizeDomain(newName)
            : newName.trim();
        if (!name) {
            showToast(connectionNeedsDomain(pickType) ? "Enter a domain" : "Enter a handle", Toasts.Type.FAILURE);
            return;
        }

        settings.store.customConnections = [...custom, {
            id: `larp-${pickType}-${Date.now()}`,
            type: pickType,
            name,
        }];

        setPickType(null);
        setNewName("");
        triggerProfileRefresh();
    };

    const activeReal = realConnections.filter(c => !hiddenSet.has(connKey(c)));
    const hiddenReal = realConnections.filter(c => hiddenSet.has(connKey(c)));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!activeReal.length && !custom.length && !hiddenReal.length && (
                <Forms.FormText style={{ margin: 0, color: "var(--text-muted)" }}>
                    No linked accounts on your profile.
                </Forms.FormText>
            )}

            {activeReal.map(connection => {
                const key = connKey(connection);
                const override = overrides[key] ?? overrides[connection.type];
                return (
                    <ConnectionRow
                        key={key}
                        type={connection.type}
                        value={override?.name ?? connection.name}
                        onChange={v => updateOverride(key, v)}
                        placeholder={connection.name}
                        actionLabel="Remove"
                        onAction={() => hideRealConnection(key)}
                    />
                );
            })}

            {custom.map(cc => (
                <ConnectionRow
                    key={cc.id}
                    type={cc.type}
                    value={cc.name}
                    onChange={v => updateCustom(cc.id, v)}
                    placeholder={connectionNeedsDomain(cc.type) ? "example.com" : "Handle"}
                    actionLabel="Remove"
                    onAction={() => removeCustom(cc.id)}
                />
            ))}

            {availableTypes.length > 0 && (
                <div style={{ ...connectionRowStyle, flexWrap: "wrap" }}>
                    {pickType ? (
                        <ConnectionPlatformIcon type={pickType} size={24} />
                    ) : (
                        <div style={{ width: 24, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 120 }}>
                        <SearchableSelect
                            options={availableTypes}
                            value={pickType}
                            onChange={setPickType}
                            placeholder="Add connection..."
                            closeOnSelect
                        />
                    </div>
                    {pickType && (
                        <TextInput
                            value={newName}
                            onChange={setNewName}
                            placeholder={connectionNeedsDomain(pickType) ? "example.com" : "Handle"}
                            style={{ flex: 1, minWidth: 100 }}
                        />
                    )}
                    <Button
                        size="tiny"
                        variant="secondary"
                        disabled={!pickType || !newName.trim()}
                        onClick={addCustom}
                    >
                        Add
                    </Button>
                </div>
            )}

            {hiddenReal.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                    {hiddenReal.map(connection => {
                        const key = connKey(connection);
                        return (
                            <div
                                key={key}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 10px", opacity: 0.55 }}
                            >
                                <ConnectionPlatformIcon type={connection.type} size={20} />
                                <Text variant="text-xs/normal" style={{ color: "var(--text-muted)", flex: 1 }}>
                                    Hidden
                                </Text>
                                <Button size="tiny" variant="secondary" onClick={() => restoreRealConnection(key)}>
                                    Restore
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function BadgeSection({ title, badges, owned, search }: {
    title: string;
    badges: BadgeEntry[];
    owned: boolean;
    search?: string;
}) {
    const q = search?.trim().toLowerCase();
    const filtered = q
        ? badges.filter(b => b.description.toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
        : badges;

    if (!badges.length) {
        if (!owned) return null;
        return (
            <div style={{ marginBottom: 24 }}>
                <div style={sectionTitleStyle}>{title}</div>
                <Forms.FormText style={{ margin: 0, color: "var(--text-muted)" }}>
                    Loading your badges… try reopening if this stays empty.
                </Forms.FormText>
            </div>
        );
    }

    const countLabel = filtered.length !== badges.length
        ? `${filtered.length}/${badges.length}`
        : String(badges.length);

    return (
        <div style={{ marginBottom: 24 }}>
            <div style={sectionTitleStyle}>
                {title}
                <span style={{ marginLeft: 8, opacity: 0.55, fontWeight: 600 }}>{countLabel}</span>
            </div>
            {!filtered.length ? (
                <Forms.FormText style={{ margin: 0, color: "var(--text-muted)" }}>No badges match your search.</Forms.FormText>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filtered.map(badge => (
                        <BadgeRow
                            key={badge.id}
                            badge={badge}
                            owned={owned}
                            visible={owned ? isOwnedBadgeVisible(badge.id) : isAddedBadgeVisible(badge.id)}
                            onChange={visible => {
                                if (owned) setOwnedBadgeVisible(badge.id, visible);
                                else setAddedBadgeVisible(badge.id, visible);
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ConfigSection() {
    const [importText, setImportText] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const exportJson = () => copyWithToast(
        JSON.stringify(getLarpExportData(), null, 2),
        "Config copied"
    );

    const downloadJson = () => {
        const data = getLarpExportData();
        const name = settings.store.customUsername.trim() || "config";
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `larp-${name}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Config downloaded", Toasts.Type.SUCCESS);
    };

    const doImport = (raw: string) => {
        const data = parseLarpImport(raw);
        if (!data) {
            showToast("Invalid config JSON", Toasts.Type.FAILURE);
            return;
        }
        applyLarpExportData(data);
        setImportText("");
        showToast("Config applied", Toasts.Type.SUCCESS);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={connectionRowStyle}>
                <Text variant="text-xs/medium" style={{ color: "var(--text-muted)", flex: 1 }}>Export config</Text>
                <Button size="tiny" variant="secondary" onClick={exportJson}>Copy</Button>
                <Button size="tiny" variant="secondary" onClick={downloadJson}>Save</Button>
            </div>

            <div style={{ ...cardStyle, padding: 12 }}>
                <TextInput
                    value={importText}
                    onChange={setImportText}
                    placeholder="Paste config JSON..."
                    style={{ fontFamily: "var(--font-code)", marginBottom: 8 }}
                />
                <input
                    ref={fileRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => doImport(String(reader.result ?? ""));
                        reader.readAsText(file);
                        e.target.value = "";
                    }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                    <Button
                        size="tiny"
                        variant="secondary"
                        disabled={!importText.trim()}
                        onClick={() => doImport(importText)}
                    >
                        Apply
                    </Button>
                    <Button size="tiny" variant="secondary" onClick={() => fileRef.current?.click()}>
                        Browse
                    </Button>
                </div>
            </div>
        </div>
    );
}

const BadgeModal = ErrorBoundary.wrap(function BadgeModal(props: RenderModalProps) {
    const [tab, setTab] = useState<number>(ModalTabs.Username);
    const [search, setSearch] = useState("");
    const [profileReady, setProfileReady] = useState(false);

    useEffect(() => {
        let alive = true;
        void refreshOwnProfile().finally(() => {
            if (alive) setProfileReady(true);
        });
        return () => { alive = false; };
    }, []);

    settings.use([
        "customUsername",
        "hiddenBadges",
        "addedBadges",
        "connectionOverrides",
        "hiddenConnections",
        "customConnections",
    ]);
    void profileReady;
    const { yours, other } = useStateFromStores(
        [UserProfileStore, UserStore],
        () => getModalBadgeLists()
    );

    return (
        <Modal
            {...props}
            title={<ProfilePreview asTitle />}
            size="lg"
            actions={[
                { text: "Reset", variant: "secondary", onClick: resetLarpConfig },
                { text: "Close", variant: "primary", onClick: props.onClose },
            ]}
        >
            <div style={{ padding: "0 16px 6px" }}>
                <TabBar
                    type="top"
                    look="brand"
                    selectedItem={tab}
                    onItemSelect={setTab}
                    style={{ marginBottom: 14 }}
                >
                    <TabBar.Item id={ModalTabs.Username}>Username</TabBar.Item>
                    <TabBar.Item id={ModalTabs.Badges}>Badges</TabBar.Item>
                    <TabBar.Item id={ModalTabs.Connections}>Connections</TabBar.Item>
                    <TabBar.Item id={ModalTabs.Data}>Config</TabBar.Item>
                </TabBar>

                <ScrollerThin style={{ maxHeight: "48vh", paddingTop: 2 }}>
                    {tab === ModalTabs.Username && (
                        <div style={cardStyle}>
                            <Text variant="text-xs/medium" style={{ ...sectionTitleStyle, marginBottom: 8 }}>
                                Custom username
                            </Text>
                            <TextInput
                                value={settings.store.customUsername}
                                onChange={v => {
                                    settings.store.customUsername = v;
                                    triggerProfileRefresh();
                                }}
                                placeholder="Your @username"
                                maxLength={32}
                            />
                        </div>
                    )}

                    {tab === ModalTabs.Badges && (
                        <div>
                            <div style={{
                                marginBottom: 28,
                                paddingBottom: 20,
                                borderBottom: "1px solid var(--background-modifier-accent)",
                            }}>
                                <TextInput
                                    value={search}
                                    onChange={setSearch}
                                    placeholder="Search badges..."
                                />
                            </div>
                            <BadgeSection title="Your Badges" badges={yours} owned search={search} />
                            <BadgeSection title="Add Badges" badges={other} owned={false} search={search} />
                        </div>
                    )}

                    {tab === ModalTabs.Connections && <ConnectionsSection />}

                    {tab === ModalTabs.Data && <ConfigSection />}
                </ScrollerThin>

                <a
                    href="https://github.com/sp5-y/discord-larp-plugin"
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{
                        display: "block",
                        textAlign: "center",
                        marginTop: 8,
                        color: "var(--text-muted)",
                        opacity: 0.45,
                        fontSize: 12,
                        lineHeight: "16px",
                        textDecoration: "none",
                        cursor: "pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; }}
                    onMouseLeave={e => { e.currentTarget.style.textDecoration = "none"; }}
                >
                    made by: sp5
                </a>
            </div>
        </Modal>
    );
}, { noop: true });

function applyGetLegacyUsernameFilter(proto: { getLegacyUsername: () => string | null; userId?: string; }) {
    if ((proto as { __larpLegacyPatched?: boolean; }).__larpLegacyPatched) return;

    const original = proto.getLegacyUsername;
    proto.getLegacyUsername = function (this: { userId: string; }) {
        if (settings.store.enabled && this.userId === getCurrentUserId()) {
            const custom = getCustomName();
            if (custom) return custom;
        }
        return original.call(this);
    };

    (proto as { __larpLegacyPatched?: boolean; }).__larpLegacyPatched = true;
    unpatchFns.push(() => {
        proto.getLegacyUsername = original;
        delete (proto as { __larpLegacyPatched?: boolean; }).__larpLegacyPatched;
    });
}

function applyGetBadgesFilter(proto: { getBadges: () => unknown[]; getLegacyUsername?: () => string | null; }) {
    if ((proto as { __larpToolPatched?: boolean; }).__larpToolPatched) return;

    if (proto.getLegacyUsername) applyGetLegacyUsernameFilter(proto as { getLegacyUsername: () => string | null; });

    const original = proto.getBadges;
    unfilteredGetBadges = function (this: { userId: string; }) {
        return original.call(this) as Array<{ id?: string; key?: string; icon?: string; iconSrc?: string; }>;
    };

    proto.getBadges = function (this: { userId: string; }) {
        return filterBadges(this, unfilteredGetBadges!.call(this));
    };

    (proto as { __larpToolPatched?: boolean; }).__larpToolPatched = true;
    unpatchFns.push(() => {
        proto.getBadges = original;
        delete (proto as { __larpToolPatched?: boolean; }).__larpToolPatched;
        if (unfilteredGetBadges) unfilteredGetBadges = null;
    });
}

function patchDisplayProfile() {
    try {
        const userId = getCurrentUserId();
        if (userId) {
            const profile = DisplayProfileUtils.getDisplayProfile(userId);
            if (profile) applyGetBadgesFilter(Object.getPrototypeOf(profile) as { getBadges: () => unknown[]; });
        }
    } catch { }

    waitFor(
        m => typeof m === "function" && m.prototype?.getBadges && m.prototype?.getLegacyUsername,
        (DisplayProfile: { prototype: { getBadges: () => unknown[]; }; }) => {
            applyGetBadgesFilter(DisplayProfile.prototype);
        }
    );
}

function patchDisplayProfileUtils() {
    const origGet = DisplayProfileUtils.getDisplayProfile;
    const origUse = DisplayProfileUtils.useDisplayProfile;

    DisplayProfileUtils.getDisplayProfile = (userId, guildId, customStores) =>
        wrapDisplayProfile(origGet(userId, guildId, customStores));

    DisplayProfileUtils.useDisplayProfile = (userId, guildId, customStores) =>
        wrapDisplayProfile(origUse(userId, guildId, customStores));

    unpatchFns.push(() => {
        DisplayProfileUtils.getDisplayProfile = origGet;
        DisplayProfileUtils.useDisplayProfile = origUse;
    });
}

function wrapOwnUserProfile(profile: NonNullable<ReturnType<typeof UserProfileStore.getUserProfile>>, userId: string) {
    const cached = wrappedProfileCache.get(profile);
    if (cached?.gen === profileWrapGeneration) return cached.value;

    const wrapped = Object.assign(Object.create(Object.getPrototypeOf(profile)), profile, {
        badges: profile.badges?.length ? filterBadges({ userId }, profile.badges) : profile.badges,
        connectedAccounts: applyLarpConnections(profile.connectedAccounts),
    });

    wrappedProfileCache.set(profile, { gen: profileWrapGeneration, value: wrapped });
    return wrapped;
}

function patchUserProfileStore() {
    origGetUserProfile = UserProfileStore.getUserProfile.bind(UserProfileStore);

    UserProfileStore.getUserProfile = (userId: string) => {
        const profile = origGetUserProfile(userId);
        if (!profile || userId !== getCurrentUserId() || !settings.store.enabled) return profile;
        return wrapOwnUserProfile(profile, userId);
    };

    unpatchFns.push(() => {
        UserProfileStore.getUserProfile = origGetUserProfile;
    });
}

function patchProfileDomScope() {
    const markOwnProfileNodes = () => {
        if (!settings.store.enabled || !settings.store.hiddenBadges.length) return;

        const userId = getCurrentUserId();
        if (!userId) return;

        const real = getRealUsername();
        for (const el of document.querySelectorAll(`[aria-label$=" profile popout"], [class*="userPopout"]`)) {
            if (el.querySelector(`[href="/users/${userId}"]`) || (real && el.textContent?.includes(real))) {
                (el as HTMLElement).dataset.larpUser = userId;
            }
        }

        const accountPanel = document.querySelector("[class*='accountProfile']");
        if (accountPanel) (accountPanel as HTMLElement).dataset.larpUser = userId;
    };

    let scheduled = false;
    let rafId = 0;
    const scheduleMark = () => {
        if (scheduled) return;
        scheduled = true;
        rafId = requestAnimationFrame(() => {
            scheduled = false;
            markOwnProfileNodes();
        });
    };

    const observer = new MutationObserver(scheduleMark);
    observer.observe(document.body, { childList: true, subtree: true });
    markOwnProfileNodes();

    unpatchFns.push(() => {
        observer.disconnect();
        cancelAnimationFrame(rafId);
    });
}

function patchParser() {
    origParserParse = Parser.parse.bind(Parser);
    Parser.parse = ((content: unknown, ...args: unknown[]) => {
        if (typeof content !== "string") {
            return origParserParse(content as string, ...args);
        }
        if (!usernameSwapCtx.active || !content.includes(usernameSwapCtx.real)) {
            return origParserParse(content, ...args);
        }
        return origParserParse(swapRealUsernameInText(content), ...args);
    }) as typeof Parser.parse;

    unpatchFns.push(() => {
        Parser.parse = origParserParse;
    });
}

function wrapMessageCollection(collection: ReturnType<typeof MessageStore.getMessages>) {
    if (!collection || !usernameSwapCtx.active) return collection;

    const cachedProxy = messageCollectionProxyCache.get(collection);
    if (cachedProxy) return cachedProxy;

    let cachedArray: Message[] | null = null;
    let cachedSource: Message[] | null = null;
    let arrayGen = messageCollectionGeneration;

    const proxy = new Proxy(collection, {
        get(target, prop, receiver) {
            if (prop === "__larpWrapped") return true;
            if (prop === "_array") {
                const source = Reflect.get(target, "_array", receiver) as Message[];
                if (arrayGen === messageCollectionGeneration && cachedSource === source && cachedArray) {
                    return cachedArray;
                }
                cachedArray = source.map(m => wrapMessageForDisplay(m)!);
                cachedSource = source;
                arrayGen = messageCollectionGeneration;
                return cachedArray;
            }
            const value = Reflect.get(target, prop, receiver);
            if (prop === "get" && typeof value === "function") {
                return (id: string) => wrapMessageForDisplay(value.call(target, id));
            }
            return value;
        },
    }) as ReturnType<typeof MessageStore.getMessages>;

    messageCollectionProxyCache.set(collection, proxy);
    return proxy;
}

function patchMessageStore() {
    origGetMessage = MessageStore.getMessage.bind(MessageStore);
    origGetMessages = MessageStore.getMessages.bind(MessageStore);

    MessageStore.getMessage = (channelId, messageId) => {
        const message = origGetMessage(channelId, messageId);
        if (!usernameSwapCtx.active) return message!;
        return wrapMessageForDisplay(message)!;
    };

    MessageStore.getMessages = channelId => {
        const collection = origGetMessages(channelId);
        if (!usernameSwapCtx.active) return collection;
        return wrapMessageCollection(collection);
    };

    unpatchFns.push(() => {
        MessageStore.getMessage = origGetMessage;
        MessageStore.getMessages = origGetMessages;
    });
}

function patchUserStore() {
    origGetCurrentUser = UserStore.getCurrentUser.bind(UserStore);
    origGetUser = UserStore.getUser.bind(UserStore);

    UserStore.getCurrentUser = () => {
        const user = origGetCurrentUser();
        if (!user || !settings.store.enabled) return user;
        return withCustomUsernameOnly(user) ?? user;
    };

    UserStore.getUser = (userId: string) => {
        const user = origGetUser(userId);
        if (!user || !settings.store.enabled) return user;
        return withCustomUsernameOnly(user) ?? user;
    };

    unpatchFns.push(() => {
        UserStore.getCurrentUser = origGetCurrentUser;
        UserStore.getUser = origGetUser;
    });
}

function patchAccountSettingsStore(AccountStore: {
    getSettings: () => { userId?: string; username?: string; } | null;
}) {
    const origGetSettings = AccountStore.getSettings.bind(AccountStore);

    AccountStore.getSettings = () => {
        const accountSettings = origGetSettings();
        if (!accountSettings?.userId || accountSettings.userId !== getCurrentUserId()) {
            return accountSettings;
        }

        const custom = getCustomName();
        if (!custom || accountSettings.username === custom) return accountSettings;

        return { ...accountSettings, username: custom };
    };

    unpatchFns.push(() => {
        AccountStore.getSettings = origGetSettings;
    });
}

function patchAccountSettingsStoreLoader() {
    waitFor(
        filters.byCode("USER_SETTINGS_MODAL_OPEN", "getSettings"),
        patchAccountSettingsStore
    );
}

function patchUsernameUtils() {
    const origGetUserTag = UsernameUtils.getUserTag.bind(UsernameUtils);
    const origUseUserTag = UsernameUtils.useUserTag;

    UsernameUtils.getUserTag = (user: User, options?: Parameters<typeof UsernameUtils.getUserTag>[1]) => {
        const spoofed = withCustomUsernameOnly(user) ?? user;
        return swapUsernameTag(user, origGetUserTag(spoofed, options));
    };

    UsernameUtils.useUserTag = (user: User, options?: Parameters<typeof UsernameUtils.useUserTag>[1]) => {
        const spoofed = withCustomUsernameOnly(user) ?? user;
        return swapUsernameTag(user, origUseUserTag(spoofed, options));
    };

    unpatchFns.push(() => {
        UsernameUtils.getUserTag = origGetUserTag;
        UsernameUtils.useUserTag = origUseUserTag;
    });
}



export default definePlugin({
    name: "Larp Tool",
    description: "Spoof badges and @username locally. Ctrl+B to open.",
    authors: [{ name: "allbadges", id: 0n }],
    dependencies: ["BadgeAPI"],
    enabledByDefault: true,
    settings,

    patches: [
        {
            find: "...$self.getBadges(this),",
            replacement: {
                match: /return \[\.\.\.\$self\.getBadges\(this\),([\s\S]*?)\];/,
                replace: "return $self.filterBadges(this,[...$self.getBadges(this),$1]);"
            },
        },
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            all: true,
            replacement: [
                {
                    match: /(\i)\.getBadges\(\)\.map/,
                    replace: "$self.filterBadges($1,$1.getBadges()).map"
                },
                {
                    match: /(\i)\.getBadges\(\)/,
                    replace: "$self.filterBadges($1,$1.getBadges())"
                },
                {
                    match: /src:(\i)\.iconSrc/,
                    replace: "src:$self.getBadgeIconSrc($1)"
                },
            ],
        },
        {
            find: '"UserProfilePopout");',
            replacement: [
                {
                    match: /userId:(\i)/,
                    replace: 'userId:$1,"data-user-id":$1'
                },
                {
                    match: /user:(\i),/,
                    replace: "user:$self.withCustomUsernameOnly($1),"
                },
            ],
        },
        {
            find: ".USER_MENTION)",
            replacement: {
                match: /children:`@\$\{(\i\?\?\i)\}`(?<=\.useName\((\i)\).+?)/,
                replace: "children:$self.renderMentionUsername({username:$1,user:$2})"
            }
        },
        {
            find: 'userId:e.id,username:e.username,discriminator:e.discriminator,email:e.email,avatar:e.avatar,password:""',
            replacement: {
                match: /username:e\.username/,
                replace: "username:$self.getAccountSettingsUsername(e)"
            }
        },
        {
            find: "#{intl::ACCOUNT_USERNAME}",
            replacement: {
                match: /(?<=children:)(\i)\.username/,
                replace: "$self.getAccountSettingsUsername($1)"
            }
        },
    ],

    withCustomUsernameOnly,
    filterBadges,
    getCurrentUserId,
    getAccountSettingsUsername,
    getRealUsername,
    swapRealUsernameInText,
    wrapMessageForDisplay,
    mapEmbed,
    getBadgeIconSrc(badge: { userId?: string; id?: string; key?: string; icon?: string; iconSrc?: string; }) {
        const transparent = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        const ownerId = badge.userId ?? badgeProfileUserId;
        if (settings.store.enabled && ownerId === getCurrentUserId() && isBadgeHiddenObject(badge)) {
            return transparent;
        }
        if (badge.iconSrc) return badge.iconSrc;
        const hash = getBadgeIconHash(badge);
        if (hash) return `https://cdn.discordapp.com/badge-icons/${hash}.png?size=96`;
        return badge.iconSrc;
    },

    renderMentionUsername: ErrorBoundary.wrap(({ username, user }: { username: string; user: User; }) => {
        if (user?.id === getCurrentUserId()) {
            const custom = getCustomName();
            if (custom) return <>{`@${custom}`}</>;
        }
        return <>{`@${username}`}</>;
    }, { noop: true }),

    toolboxActions: {
        "Open Larp Tool": openBadgeManager,
    },

    start() {
        document.addEventListener("keydown", handleKeyDown, true);
        try { patchUserStore(); } catch (e) { console.warn("larp: user store patch", e); }
        try { patchMessageStore(); } catch (e) { console.warn("larp: message store patch", e); }
        try { patchParser(); } catch (e) { console.warn("larp: parser patch", e); }
        refreshCachedUsername();
        FluxDispatcher.subscribe("USER_UPDATE", refreshCachedUsername);
        unpatchFns.push(() => FluxDispatcher.unsubscribe("USER_UPDATE", refreshCachedUsername));

        try { addProfileBadge(badgeInjector); } catch (e) { console.warn("larp: badge inject failed", e); }
        try { patchAccountSettingsStoreLoader(); } catch {}
        try { patchUserProfileStore(); } catch (e) { console.warn(e); }
        try { patchDisplayProfileUtils(); } catch {}
        try { patchDisplayProfile(); } catch (e) { console.warn("display profile patch", e); }
        try { patchProfileDomScope(); } catch {}
        try { patchUsernameUtils(); } catch {}

        updateHiddenBadgeStyles();
    },

    stop() {
        document.removeEventListener("keydown", handleKeyDown, true);
        try { removeProfileBadge(badgeInjector); } catch {}
        document.getElementById(HIDDEN_BADGE_STYLE_ID)?.remove();
        for (const fn of unpatchFns.splice(0)) fn();
    },
});
