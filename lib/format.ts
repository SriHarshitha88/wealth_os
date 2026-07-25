// Indian-currency formatting helpers.
export const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

// Crore / lakh compaction for large sums.
export const cr = (n: number) =>
  n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr'
  : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + ' L'
  : inr(n);

export const pct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
