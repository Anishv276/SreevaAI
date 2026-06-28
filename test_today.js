const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const trendMap = new Map();
for (let i = 0; i < 24; i++) {
    const hourDate = new Date(startOfToday.getTime() + i * 60 * 60 * 1000);
    const hourLabel = hourDate.toISOString().split('T')[0] + ' ' + hourDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    trendMap.set(hourLabel, 0);
}
console.log(Array.from(trendMap.entries()));
