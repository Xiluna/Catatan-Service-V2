/**
 * charts.js - Chart.js Initializer & Updater
 */

const ChartsService = {
  dailyChartInstance: null,
  compositionChartInstance: null,

  formatRupiah(num) {
    return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
  },

  getThemeColors() {
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0068B5';
    
    return {
      accent: accent,
      accentAlpha: accent + '33',
      modalColor: isDark ? '#64748B' : '#94A3B8',
      textColor: isDark ? '#94A3B8' : '#596780',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
    };
  },

  renderCharts(entries, yearMonth) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded yet');
      return;
    }

    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-12

    const daysInMonth = new Date(year, month, 0).getDate();
    const colors = this.getThemeColors();

    // 1. Prepare daily profit data (All days present, days without transactions = 0)
    const dailyProfits = new Array(daysInMonth).fill(0);
    const dayLabels = [];

    for (let d = 1; d <= daysInMonth; d++) {
      dayLabels.push(String(d));
    }

    let totalModal = 0;
    let totalProfit = 0;

    entries.forEach(e => {
      const modal = Number(e.modal) || 0;
      const profit = Number(e.profit) || 0;
      totalModal += modal;
      totalProfit += profit;

      if (e.tanggal && e.tanggal.startsWith(yearMonth)) {
        const parts = e.tanggal.split('-');
        const day = parseInt(parts[2], 10);
        if (day >= 1 && day <= daysInMonth) {
          dailyProfits[day - 1] += profit;
        }
      }
    });

    // 2. Render / Update Daily Bar Chart
    const dailyCanvas = document.getElementById('dailyProfitChart');
    if (dailyCanvas) {
      if (this.dailyChartInstance) {
        this.dailyChartInstance.destroy();
      }

      const ctx = dailyCanvas.getContext('2d');
      this.dailyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: dayLabels,
          datasets: [{
            label: 'Profit Harian',
            data: dailyProfits,
            backgroundColor: colors.accent,
            borderRadius: 4,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => 'Profit: ' + this.formatRupiah(context.raw)
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: colors.textColor,
                font: { size: 10 },
                maxTicksLimit: 15
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: colors.gridColor },
              ticks: {
                color: colors.textColor,
                font: { size: 10 },
                callback: (val) => {
                  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                  if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
                  return val;
                }
              }
            }
          }
        }
      });
    }

    // 3. Render / Update Modal vs Profit Doughnut Chart
    const compCanvas = document.getElementById('compositionChart');
    if (compCanvas) {
      if (this.compositionChartInstance) {
        this.compositionChartInstance.destroy();
      }

      const hasData = totalModal > 0 || totalProfit > 0;
      const ctxComp = compCanvas.getContext('2d');

      this.compositionChartInstance = new Chart(ctxComp, {
        type: 'doughnut',
        data: {
          labels: ['Modal (Sparepart)', 'Profit Bersih'],
          datasets: [{
            data: hasData ? [totalModal, Math.max(0, totalProfit)] : [1, 1],
            backgroundColor: hasData
              ? [colors.modalColor, colors.accent]
              : [colors.gridColor, colors.gridColor],
            borderWidth: 2,
            borderColor: 'transparent'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: colors.textColor,
                boxWidth: 12,
                font: { size: 11, weight: '600' },
                padding: 12
              }
            },
            tooltip: {
              enabled: hasData,
              callbacks: {
                label: (context) => {
                  const val = context.raw;
                  const total = totalModal + totalProfit;
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                  return `${context.label}: ${this.formatRupiah(val)} (${pct})`;
                }
              }
            }
          }
        }
      });
    }
  }
};
