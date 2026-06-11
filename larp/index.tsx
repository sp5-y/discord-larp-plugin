// larp tool - vencord userplugin, client side only

import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import ErrorBoundary from "@components/ErrorBoundary";
import { RenderModalProps, User } from "@vencord/discord-types";
import { waitFor, filters } from "@webpack";
import {
    AuthenticationStore, ConnectedAccount, Constants, FluxDispatcher,
    openModal, Modal, TextInput, Checkbox, Button, Forms, Text,
    DisplayProfileUtils, ScrollerThin, UserProfileStore, UserStore,
    UsernameUtils, useStateFromStores,
} from "@webpack/common";

interface BadgeEntry {
    id: string;
    description: string;
    icon: string;
    link?: string;
}

function getCurrentUserId() {
    return AuthenticationStore.getId();
}

function connKey(c: ConnectedAccount) {
    return `${c.type}:${c.id}`;
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
});

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
let cachedRealUsername = "";

const HIDDEN_BADGE_STYLE_ID = "vc-larp-tool-hidden-badges";

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
    const hidden = new Set<string>();
    for (const id of settings.store.hiddenBadges) {
        for (const expanded of expandBadgeHideIds(id)) hidden.add(expanded);
    }
    return hidden;
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
    if ((profile as { __larpToolWrapped?: boolean; }).__larpToolWrapped) return profile;

    const userId = profile.userId;
    const origGetBadges = profile.getBadges.bind(profile);

    return new Proxy(profile, {
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
            const value = Reflect.get(target, prop, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as T;
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

    return Object.assign(Object.create(Object.getPrototypeOf(user)), user, { username: custom });
}

function getAccountSettingsUsername(user: User) {
    if (!settings.store.enabled || user.id !== getCurrentUserId()) return user.username;
    return getCustomName() ?? user.username;
}

function refreshCachedUsername() {
    const user = UserStore.getCurrentUser();
    if (!user?.id || user.id !== getCurrentUserId()) return;

    const custom = getCustomName();
    if (!custom || user.username !== custom) {
        cachedRealUsername = user.username;
    }
}

function applyConnectionOverrides(connections: ConnectedAccount[] | undefined) {
    if (!connections?.length || !settings.store.enabled) return connections;

    const overrides = settings.store.connectionOverrides;
    let changed = false;

    const mapped = connections.map(connection => {
        const key = connKey(connection);
        const override = overrides[key] ?? overrides[connection.type];
        if (!override) return connection;

        const name = override.name?.trim();
        if (!name) return connection;

        changed = true;
        return { ...connection, name };
    });

    return changed ? mapped : connections;
}

function swapUsernameTag(user: User | null | undefined, tag: string) {
    if (!user?.id || user.id !== getCurrentUserId()) return tag;

    const custom = getCustomName();
    if (!custom || typeof tag !== "string") return tag;

    const real = cachedRealUsername || user.username;
    if (real && tag.includes(real)) return tag.replace(real, custom);
    return tag.includes(user.username) ? tag.replace(user.username, custom) : tag;
}

function getNativeBadgeIds(): Set<string> {
    const userId = getCurrentUserId();
    if (!userId) return new Set();

    const ids = new Set<string>();

    for (const badge of getRawUserProfile(userId)?.badges ?? []) {
        const key = getBadgeKey(badge);
        if (key) ids.add(key);
    }

    const user = UserStore.getCurrentUser();
    if (!user) return ids;

    for (const [key, flag] of Object.entries(UserFlags)) {
        if (typeof flag !== "number") continue;
        if (!user.hasFlag(flag)) continue;
        const badgeId = FLAG_BADGE_IDS[key.toLowerCase()];
        if (badgeId) ids.add(badgeId);
    }

    if (user.premiumType) ids.add("premium_bronze");

    return ids;
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
    const userId = getCurrentUserId();
    const user = UserStore.getCurrentUser();
    if (!user || !userId) return;

    FluxDispatcher.dispatch({ type: "USER_UPDATE", user });

    const profile = getRawUserProfile(userId);
    if (profile) {
        FluxDispatcher.dispatch({ type: "USER_PROFILE_UPDATE", userProfile: profile });
    }
}

function filterBadges(
    profile: { userId?: string; user?: { id: string; }; },
    badges: Array<{ id?: string; key?: string; }>
) {
    if (!settings.store.enabled) return badges;

    const userId = profile?.userId ?? profile?.user?.id;
    if (!userId || userId !== getCurrentUserId()) return badges;

    return badges.filter(b => {
        const key = getBadgeKey(b);
        if (key && isVencordBadge(key)) return true;
        return !isBadgeHiddenObject(b);
    });
}

function getModalBadgeLists() {
    const ownedIds = getNativeBadgeIds();
    const profileBadges = getRawUserProfile(getCurrentUserId() ?? "")?.badges ?? [];
    const entries = new Map<string, BadgeEntry>();

    for (const [id, def] of Object.entries(KNOWN_BADGES)) {
        entries.set(id, { id, ...def });
    }

    for (const badge of profileBadges) {
        if (!badge.id) continue;
        ownedIds.add(badge.id);

        const existing = entries.get(badge.id);
        entries.set(badge.id, {
            id: badge.id,
            description: badge.description ?? existing?.description ?? badge.id.replace(/_/g, " "),
            icon: badge.iconSrc?.startsWith("http")
                ? badge.iconSrc
                : BADGE_ICON_MAP[badge.id] ?? existing?.icon ?? KNOWN_BADGES[badge.id]?.icon ?? "",
            link: badge.link ?? existing?.link,
        });
    }

    const yours: BadgeEntry[] = [];
    const other: BadgeEntry[] = [];

    for (const entry of entries.values()) {
        const list = ownedIds.has(entry.id) ? yours : other;
        list.push(entry);
    }

    for (const id of ownedIds) {
        if (entries.has(id)) continue;
        yours.push({
            id,
            description: id.replace(/_/g, " "),
            icon: "",
        });
    }

    yours.sort((a, b) => a.description.localeCompare(b.description));
    other.sort((a, b) => a.description.localeCompare(b.description));

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
        <div
            style={{
                padding: "4px 8px",
                borderRadius: 8,
                background: "var(--background-secondary)",
            }}
        >
            <Checkbox
                value={visible}
                onChange={(_, checked) => onChange(checked)}
                size={20}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        {icon ? (
                            <img
                                src={icon}
                                alt=""
                                width={28}
                                height={28}
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
                            <div
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 4,
                                    background: "var(--background-tertiary)",
                                }}
                            />
                        )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <Text variant="text-md/medium">{badge.description}</Text>
                    </div>
                </div>
            </Checkbox>
        </div>
    );
}

function ConnectionsSection() {
    settings.use(["connectionOverrides"]);
    const connections = useStateFromStores(
        [UserProfileStore],
        () => getRawUserProfile(getCurrentUserId() ?? "")?.connectedAccounts ?? []
    );

    const overrides = settings.store.connectionOverrides;

    const updateOverride = (key: string, value: string) => {
        const next = { ...overrides };
        if (!value.trim()) delete next[key];
        else next[key] = { name: value };
        settings.store.connectionOverrides = next;
        triggerProfileRefresh();
    };

    if (!connections.length) {
        return (
            <section style={{ marginBottom: 20 }}>
                <Forms.FormTitle tag="h5">Connections</Forms.FormTitle>
                <Forms.FormText>No linked connections on your profile.</Forms.FormText>
            </section>
        );
    }

    return (
        <section style={{ marginBottom: 20 }}>
            <Forms.FormTitle tag="h5">Connections</Forms.FormTitle>
            <Forms.FormText>Spoof connection display name</Forms.FormText>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {connections.map(connection => {
                    const key = connKey(connection);
                    const override = overrides[key] ?? overrides[connection.type];
                    return (
                        <div
                            key={key}
                            style={{
                                padding: 10,
                                borderRadius: 8,
                                background: "var(--background-secondary)",
                            }}
                        >
                            <Text variant="text-sm/medium" style={{ marginBottom: 6 }}>
                                {connection.type} — {connection.name}
                            </Text>
                            <TextInput
                                value={override?.name ?? connection.name}
                                onChange={v => updateOverride(key, v)}
                                placeholder="Display name"
                            />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function BadgeSection({ title, badges, owned }: {
    title: string;
    badges: BadgeEntry[];
    owned: boolean;
}) {
    if (!badges.length) return null;

    return (
        <section style={{ marginBottom: 20 }}>
            <Forms.FormTitle tag="h5">{title}</Forms.FormTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {badges.map(badge => (
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
        </section>
    );
}

const BadgeModal = ErrorBoundary.wrap(function BadgeModal(props: RenderModalProps) {
    settings.use([
        "customUsername",
        "hiddenBadges",
        "addedBadges",
        "connectionOverrides",
    ]);
    const { yours, other } = useStateFromStores(
        [UserProfileStore, UserStore],
        () => getModalBadgeLists()
    );

    const handleUsernameChange = (value: string) => {
        settings.store.customUsername = value;
        triggerProfileRefresh();
    };

    const handleReset = () => {
        settings.store.hiddenBadges = [];
        settings.store.addedBadges = [];
        settings.store.customUsername = "";
        settings.store.connectionOverrides = {};
        updateHiddenBadgeStyles();
        triggerProfileRefresh();
    };

    return (
        <Modal
            {...props}
            title="Larp Tool"
            size="lg"
            actions={[
                { text: "Reset", variant: "secondary", onClick: handleReset },
                { text: "Close", variant: "primary", onClick: props.onClose },
            ]}
        >
            <ScrollerThin style={{ maxHeight: "70vh" }}>
                <div style={{ padding: "4px 12px 12px" }}>
                    <section style={{ marginBottom: 20 }}>
                        <Forms.FormTitle tag="h5">Custom Handle</Forms.FormTitle>
                        <Forms.FormText>Change your custom @username handle</Forms.FormText>
                        <TextInput
                            value={settings.store.customUsername}
                            onChange={handleUsernameChange}
                            placeholder="Your @username"
                            maxLength={32}
                        />
                    </section>

                    <ConnectionsSection />

                    <BadgeSection title="Your Badges" badges={yours} owned />
                    <BadgeSection title="Add Badges" badges={other} owned={false} />
                </div>
            </ScrollerThin>
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

function patchUserProfileStore() {
    origGetUserProfile = UserProfileStore.getUserProfile.bind(UserProfileStore);

    UserProfileStore.getUserProfile = (userId: string) => {
        const profile = origGetUserProfile(userId);
        if (!profile || userId !== getCurrentUserId() || !settings.store.enabled) return profile;

        const filtered = profile.badges?.length
            ? filterBadges({ userId }, profile.badges)
            : profile.badges;
        const connections = applyConnectionOverrides(profile.connectedAccounts);

        const badgesChanged = filtered && profile.badges && filtered.length !== profile.badges.length;
        const connectionsChanged = connections !== profile.connectedAccounts;

        if (!badgesChanged && !connectionsChanged) return profile;

        const wrapped = Object.create(Object.getPrototypeOf(profile));
        Object.assign(wrapped, profile, {
            ...(badgesChanged ? { badges: filtered } : {}),
            ...(connectionsChanged ? { connectedAccounts: connections } : {}),
        });
        return wrapped;
    };

    unpatchFns.push(() => {
        UserProfileStore.getUserProfile = origGetUserProfile;
    });
}

function patchProfileDomScope() {
    const markOwnProfileNodes = () => {
        const userId = getCurrentUserId();
        if (!userId) return;

        for (const el of document.querySelectorAll(`[aria-label$=" profile popout"], [class*="userPopout"]`)) {
            if (el.querySelector(`[href="/users/${userId}"]`) || el.textContent?.includes(UserStore.getCurrentUser()?.username ?? "")) {
                (el as HTMLElement).dataset.larpUser = userId;
            }
        }

        const accountPanel = document.querySelector("[class*='accountProfile']");
        if (accountPanel) (accountPanel as HTMLElement).dataset.larpUser = userId;
    };

    const observer = new MutationObserver(markOwnProfileNodes);
    observer.observe(document.body, { childList: true, subtree: true });
    markOwnProfileNodes();

    unpatchFns.push(() => observer.disconnect());
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
    ],

    withCustomUsernameOnly,
    filterBadges,
    getCurrentUserId,
    getAccountSettingsUsername,

    getBadgeIconSrc(badge: { userId?: string; id?: string; key?: string; icon?: string; iconSrc?: string; }) {
        const transparent = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        if (settings.store.enabled && (!badge.userId || badge.userId === getCurrentUserId()) && isBadgeHiddenObject(badge)) {
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
