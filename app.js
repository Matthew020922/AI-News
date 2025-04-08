document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM已加载，开始初始化应用...');
    
    // 获取页面元素
    const currentReportSection = document.querySelector('.daily-report.current');
    const historyReportsSection = document.querySelector('.history-reports');
    
    // 检查元素是否存在
    if (!currentReportSection) {
        console.error('当前日报区域元素未找到');
    }
    
    if (!historyReportsSection) {
        console.error('历史日报区域元素未找到');
    }
    
    // 获取当前日报
    fetchCurrentReport();
    
    // 获取历史日报
    fetchArchivedReports();
    
    // 处理"查看日报"按钮点击事件
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('view-details')) {
            const reportId = e.target.dataset.reportId;
            
            if (reportId === 'current') {
                window.location.href = 'detail.html';
            } else {
                window.location.href = `detail.html?report=${reportId}`;
            }
        }
    });
    
    // 从API获取当前日报
    async function fetchCurrentReport() {
        console.log('正在获取当前日报数据...');
        
        try {
            const response = await fetch('/api/current-report');
            if (!response.ok) {
                throw new Error(`获取当前日报失败: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('成功获取当前日报数据:', data);
            renderCurrentReport(data);
        } catch (error) {
            console.error('获取当前日报时出错:', error);
            currentReportSection.innerHTML = `
                <div class="error-message">
                    <p>加载日报失败，请稍后再试。错误: ${error.message}</p>
                    <button onclick="location.reload()">重试</button>
                </div>
            `;
        }
    }
    
    // 从API获取归档日报列表
    async function fetchArchivedReports() {
        console.log('正在获取历史日报数据...');
        
        try {
            const response = await fetch('/api/archived-reports');
            if (!response.ok) {
                throw new Error(`获取历史日报失败: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('成功获取历史日报数据:', data);
            renderArchivedReports(data);
        } catch (error) {
            console.error('获取历史日报时出错:', error);
            historyReportsSection.innerHTML = `
                <h3>往期日报</h3>
                <div class="error-message">
                    <p>加载历史日报失败，请稍后再试。错误: ${error.message}</p>
                    <button onclick="location.reload()">重试</button>
                </div>
            `;
        }
    }
    
    // 渲染当前日报
    function renderCurrentReport(report) {
        console.log('正在渲染当前日报...');
        
        if (!report || !report.news || !Array.isArray(report.news)) {
            console.error('日报数据格式不正确:', report);
            currentReportSection.innerHTML = `
                <div class="error-message">
                    <p>日报数据格式不正确</p>
                </div>
            `;
            return;
        }
        
        const topicsHtml = report.news.slice(0, 10).map((item, index) => {
            // 从服务器标题中提取原始标题（去除编号前缀）
            let originalTitle = item.title || '';
            // 如果标题包含编号（格式为"序号、标题内容"），则移除编号部分
            if (originalTitle.includes('、')) {
                const parts = originalTitle.split('、');
                if (parts.length > 1) {
                    // 只保留编号后的原始标题部分
                    originalTitle = parts.slice(1).join('、');
                }
            }
            
            return `
                <div class="topic-item">
                    <span class="topic-number">${index + 1}、</span>
                    <p>${originalTitle}</p>
                </div>
            `;
        }).join('');
        
        currentReportSection.innerHTML = `
            <div class="report-card">
                <div class="report-date">${report.chineseDate} ${report.time} 华泰证券AI日报</div>
                <div class="report-content">
                    <div class="report-text" style="padding-right: 0">
                        <h2>${report.title}</h2>
                        <button class="view-details" data-report-id="current">查看日报</button>
                    </div>
                </div>
                
                <div class="hot-topics">
                    <div class="hot-topics-header">
                        <i class="fas fa-fire"></i>
                        <span>包含 ${report.newsCount} 个AI热点话题内容</span>
                    </div>
                    
                    <div class="topics-grid">
                        ${topicsHtml}
                    </div>
                </div>
            </div>
        `;
        
        console.log('当前日报渲染完成');
    }
    
    // 渲染归档日报列表
    function renderArchivedReports(reports) {
        console.log('正在渲染历史日报...', reports);
        
        if (!reports || !Array.isArray(reports) || reports.length === 0) {
            console.log('没有历史日报数据或格式不正确:', reports);
            historyReportsSection.innerHTML = `
                <h3>往期日报</h3>
                <div class="message">
                    <p>暂无历史日报</p>
                </div>
            `;
            return;
        }
        
        // 打印接收到的报告日期以进行调试
        console.log('报告日期列表:', reports.map(r => `${r.date}: ${r.chineseDate}`));
        
        // 确保报告按日期降序排序（最新的在前）
        const sortedReports = [...reports].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            console.log(`比较日期: ${a.date}(${dateA}) vs ${b.date}(${dateB}) = ${dateB - dateA}`);
            return dateB - dateA;  // 降序排序
        });
        
        console.log('排序后的报告日期:', sortedReports.map(r => `${r.date}: ${r.chineseDate}`));
        
        // 显示最近10个归档日报
        const recentReports = sortedReports.slice(0, 10);
        
        const reportsHtml = recentReports.map(report => `
            <div class="report-card history">
                <div class="report-date">${report.chineseDate} 华泰证券AI日报</div>
                <div class="report-content">
                    <div class="report-text" style="padding-right: 0; width: 100%">
                        <h2>${report.title}</h2>
                        <div class="hot-topics-header">
                            <i class="fas fa-fire"></i>
                            <span>包含 ${report.newsCount} 个AI热点话题内容</span>
                        </div>
                        <button class="view-details" data-report-id="${report.filePath}">查看日报</button>
                    </div>
                </div>
            </div>
        `).join('');
        
        historyReportsSection.innerHTML = `
            <h3>往期日报</h3>
            ${reportsHtml}
        `;
        
        console.log('历史日报渲染完成');
    }
});