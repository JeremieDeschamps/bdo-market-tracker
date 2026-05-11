export function parseWindowToHours(rawWindow) {
    const normalized = String(rawWindow || '24h').toLowerCase().trim();
    const pattern = /^(\d+)[hd]$/;
    const match = pattern.exec(normalized);

    if (!match) {
        return 24;
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = normalized.at(-1);

    if (!Number.isFinite(amount) || amount <= 0) {
        return 24;
    }

    if (unit === 'd') {
        return amount * 24;
    }

    return amount;
}
