document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('btn-refresh-ai');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchAiInsights);
  }

  fetchAiInsights();
});

async function fetchAiInsights() {
  const loading = document.getElementById('ai-loading');
  const results = document.getElementById('ai-results');
  
  if (loading) loading.classList.remove('hidden');
  if (results) results.classList.add('hidden');
  
  try {
    const data = await apiCall('GET', '/ai/analyze-issues');
    
    // Update summary metrics
    const totalIssuesEl = document.getElementById('ai-total-issues');
    if (totalIssuesEl) totalIssuesEl.textContent = data.totalIssuesAnalyzed || 0;
    
    const topIssueEl = document.getElementById('ai-top-issue');
    if (topIssueEl) {
      if (data.topIssues && data.topIssues.length > 0) {
        topIssueEl.textContent = data.topIssues[0].issueName;
      } else {
        topIssueEl.textContent = 'No Issues Detected';
      }
    }
    
    // Render issues list
    const issuesListEl = document.getElementById('ai-issues-list');
    if (issuesListEl) {
      if (data.topIssues && data.topIssues.length > 0) {
        issuesListEl.innerHTML = data.topIssues.map(issue => `
          <div class="ai-issue-item">
            <span class="ai-issue-name">${escHtml(issue.issueName)}</span>
            <span class="ai-issue-count">${issue.count} occurrences</span>
          </div>
        `).join('');
      } else {
        issuesListEl.innerHTML = '<div class="empty-state">Not enough data to detect recurring issues.</div>';
      }
    }
    
    // Render improvements list
    const improvementsListEl = document.getElementById('ai-improvements-list');
    if (improvementsListEl) {
      if (data.improvements && data.improvements.length > 0) {
        improvementsListEl.innerHTML = data.improvements.map(improvement => `
          <div class="ai-improvement-item">
            ${escHtml(improvement)}
          </div>
        `).join('');
      } else {
        improvementsListEl.innerHTML = '<div class="empty-state">No areas of improvement identified yet.</div>';
      }
    }
    
    if (loading) loading.classList.add('hidden');
    if (results) results.classList.remove('hidden');
    if (issuesListEl) staggerIn(issuesListEl, '.ai-issue-item', 40);
    if (improvementsListEl) staggerIn(improvementsListEl, '.ai-improvement-item', 40);
    
  } catch (err) {
    console.error('Failed to fetch AI insights:', err);
    if (loading) {
      loading.innerHTML = `
        <div class="empty-state">
          <p style="color: var(--danger-color); font-weight: bold;">Error loading AI insights</p>
          <p>${escHtml(err.message || 'Check connection or backend')}</p>
        </div>
      `;
    }
  }
}
