/**
 * Groups channels that are the same feed offered in multiple qualities
 * (e.g. "SKY SPORTS PREMIER LEAGUE FHD" / "... HD" / "... SD") into a single
 * list entry with a `qualityVariants` array, so the player can offer a
 * quality switcher instead of the list showing three near-identical rows.
 *
 * Real provider data trails the quality token with extra markers before the
 * name actually ends - "... FHD ◉ rec", "... HD ʀᴀᴡ", "... HD S2", "...
 * FHD VIP" - so stripping is decorator-aware rather than a single fixed
 * suffix. Anything NOT in the known decorator list (e.g. "[WEST]"/"[EAST]",
 * which mark genuinely different content, not a quality choice) blocks the
 * match entirely and the channel is left ungrouped - under-grouping is a
 * cosmetic miss, over-grouping would misrepresent different content as
 * interchangeable, so unrecognized trailing text always wins.
 */
const ChannelQuality = (() => {
    const QUALITY_ORDER = ['UHD', '4K', '4ᴋ', '8K', '8ᴋ', 'FHD', 'HD', 'SQ', 'HQ', 'SD', 'LQ'];
    // Purely technical/feed markers - safe to fold into the same variant
    // group regardless of which of these follow the quality token.
    const DECORATOR_TOKENS = [
        '◉\\s*rec', 'rec', 'raw', 'ʀᴀᴡ', 'ᴿᴬᵂ', 'event', 'ᴇᴠᴇɴᴛ', 'vip', 'hevc',
        'S\\d{1,2}', '\\[live-event\\]', '\\[events?\\]', '\\(event\\)', '4ᴋ', '8ᴋ', '4K', '8K'
    ];

    const SEP = '[\\s\\-|_([]+'; // required separator before a token
    const END = '[\\s\\-)\\]]*'; // optional trailing punctuation/space before end of string
    const decoratorGroup = `(?:${SEP}(?:${DECORATOR_TOKENS.join('|')}))*`;
    // Captures the quality token; everything after it must be only known
    // decorators (any amount) followed by nothing but trailing punctuation.
    const SUFFIX_RE = new RegExp(`${SEP}(${QUALITY_ORDER.join('|')})${decoratorGroup}${END}$`, 'i');

    const STORAGE_KEY = 'nodecast_tv_channel_quality';

    function parseName(name) {
        const match = name.match(SUFFIX_RE);
        if (!match) return { base: name.trim(), label: null };
        const label = match[1].toUpperCase().replace('ᴋ', 'K');
        const base = name.slice(0, match.index).trim();
        // Never strip down to nothing (e.g. a channel literally named "HD")
        return base ? { base, label } : { base: name.trim(), label: null };
    }

    function readPrefs() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch {
            return {};
        }
    }

    function getPreferredStreamId(sourceId, groupKey) {
        const prefs = readPrefs();
        return prefs[`${sourceId}::${groupKey}`];
    }

    function setPreferredStreamId(sourceId, groupKey, streamId) {
        const prefs = readPrefs();
        prefs[`${sourceId}::${groupKey}`] = streamId;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch {
            // Storage full or unavailable - the switch still works this session
        }
    }

    /**
     * Groups a flat list of channels (from a single source) that share a
     * category and base name. Channels with no sibling variant are returned
     * unchanged. Grouped channels keep the identity (id/streamId/tvgId) of
     * their default variant, so favorites/hidden/EPG/channel-nav - all keyed
     * on those fields - keep working exactly as before; only playback picks
     * up the chosen quality's stream.
     */
    function groupVariants(channelList) {
        const buckets = new Map();
        const order = [];

        for (const ch of channelList) {
            const { base, label } = parseName(ch.name);
            const key = `${ch.groupId}::${base.toLowerCase()}`;
            if (!buckets.has(key)) {
                buckets.set(key, []);
                order.push(key);
            }
            buckets.get(key).push({ channel: ch, base, label });
        }

        const result = [];
        for (const key of order) {
            const entries = buckets.get(key);

            if (entries.length === 1) {
                result.push(entries[0].channel);
                continue;
            }

            entries.sort((a, b) => {
                const rank = (e) => {
                    const i = e.label ? QUALITY_ORDER.indexOf(e.label) : -1;
                    return i === -1 ? QUALITY_ORDER.length : i;
                };
                return rank(a) - rank(b);
            });

            const qualityVariants = entries.map((e, idx) => ({
                streamId: e.channel.streamId,
                id: e.channel.id,
                label: e.label || `Feed ${idx + 1}`
            }));

            const sourceId = entries[0].channel.sourceId;
            const preferredStreamId = getPreferredStreamId(sourceId, key);
            const defaultEntry = entries.find(e => String(e.channel.streamId) === String(preferredStreamId))
                || entries[0];

            result.push({
                ...defaultEntry.channel,
                name: defaultEntry.base,
                qualityVariants,
                qualityGroupKey: key
            });
        }

        return result;
    }

    return { parseName, groupVariants, getPreferredStreamId, setPreferredStreamId };
})();

window.ChannelQuality = ChannelQuality;
