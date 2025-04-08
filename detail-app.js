document.addEventListener('DOMContentLoaded', function() {
    // 获取页面元素
    const detailContainer = document.querySelector('.detail-container');
    const newsContainer = document.querySelector('.news-container');
    
    // 获取URL参数
    const urlParams = new URLSearchParams(window.location.search);
    const reportParam = urlParams.get('report');
    
    // 根据URL参数决定加载当前日报还是特定归档日报
    if (reportParam) {
        fetchArchivedReport(reportParam);
    } else {
        fetchCurrentReport();
    }
    
    // 加载当前日报
    async function fetchCurrentReport() {
        try {
            const response = await fetch('/api/current-report');
            if (!response.ok) {
                throw new Error('Failed to fetch current report');
            }
            
            const data = await response.json();
            renderReport(data);
        } catch (error) {
            console.error('Error fetching current report:', error);
            showError('加载日报失败，请稍后再试。');
        }
    }
    
    // 加载特定归档日报
    async function fetchArchivedReport(filename) {
        try {
            const response = await fetch(`/api/archived-reports/${filename}`);
            if (!response.ok) {
                throw new Error('Failed to fetch archived report');
            }
            
            const data = await response.json();
            renderReport(data);
        } catch (error) {
            console.error('Error fetching archived report:', error);
            showError('加载日报失败，请稍后再试。');
        }
    }
    
    // 渲染日报详情
    function renderReport(report) {
        // 更新标题部分
        const headerHtml = `
            <div class="detail-header">
                <div class="report-date">${report.chineseDate} ${report.time || ''} 华泰证券AI日报</div>
                <h1>${report.title}</h1>
            </div>
        `;
        
        // 检查是否有新闻内容
        if (!report.news || report.news.length === 0) {
            // 如果没有新闻内容，显示提示信息
            newsContainer.innerHTML = `
                <div class="message">
                    <p>当天暂无AI新闻内容，系统将在之后自动获取并更新。</p>
                    <button class="return-button" onclick="window.location.href='index.html'">返回首页</button>
                </div>
            `;
            // 更新标题部分
            document.querySelector('.detail-header').outerHTML = headerHtml;
            return;
        }
        
        // 生成目录导航
        const navigationHtml = `
            <div class="news-navigation">
                <h3>目录</h3>
                <ul>
                    ${report.news.map((item, index) => {
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
                        
                        const itemId = item.id || 'news-'+index;
                        return `<li><a href="#${itemId}">${index + 1}、${originalTitle}</a></li>`;
                    }).join('')}
                </ul>
            </div>
        `;
        
        // 更新新闻部分
        const newsItems = report.news.map((item, index) => {
            // 处理摘要部分
            const summaryItems = Array.isArray(item.summary) 
                ? item.summary.map(point => `<li>${point}</li>`).join('')
                : '<li>未找到摘要信息</li>';
            
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
                <div class="news-item">
                    <h2 id="${item.id || 'news-'+index}" class="news-title" data-title="${originalTitle}">${index + 1}、${originalTitle} <i class="fas fa-search-plus search-deepseek-icon" title="使用DeepSeek搜索相关信息"></i></h2>
                    <div class="news-keywords">
                        <span><strong>关键词</strong>: ${item.keywords || '暂无关键词'}</span>
                    </div>
                    <div class="news-content">
                        <p>${item.content}</p>
                    </div>
                    <div class="news-summary">
                        <h3>AI Summary</h3>
                        <ul>
                            ${summaryItems}
                        </ul>
                        <div class="news-source">
                            <a href="${item.source || '#'}" target="_blank" rel="noopener noreferrer">${item.source ? '原文链接' : '暂无链接'}</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // 更新DOM
        document.querySelector('.detail-header').outerHTML = headerHtml;
        
        // 使用两列布局，左侧是新闻内容，右侧是目录导航
        newsContainer.innerHTML = `
            <div class="news-content-column">
                ${newsItems}
            </div>
            ${navigationHtml}
        `;
        
        // 重新添加平滑滚动和动画效果
        initDetailPageEffects();
        
        // 添加DeepSeek搜索功能
        addDeepSeekSearchFunctionality();
    }
    
    // 显示错误信息
    function showError(message) {
        newsContainer.innerHTML = `
            <div class="error-message">
                <p>${message}</p>
                <button class="return-button" onclick="window.location.href='index.html'">返回首页</button>
            </div>
        `;
    }
    
    // 初始化详情页效果
    function initDetailPageEffects() {
        // 返回顶部按钮
        const backToTopButton = document.createElement('div');
        backToTopButton.className = 'back-to-top';
        backToTopButton.innerHTML = '<i class="fas fa-arrow-up"></i>';
        document.body.appendChild(backToTopButton);
        
        // 显示/隐藏返回顶部按钮
        window.addEventListener('scroll', function() {
            if (window.scrollY > 300) {
                backToTopButton.classList.add('visible');
            } else {
                backToTopButton.classList.remove('visible');
            }
        });
        
        // 点击返回顶部
        backToTopButton.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
        
        // 平滑滚动到锚点
        document.querySelectorAll('.news-navigation a').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            });
        });
        
        // 给新闻项添加动画效果
        const newsItems = document.querySelectorAll('.news-item');
        
        // 检测元素是否在视口内
        function isInViewport(element) {
            const rect = element.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        }
        
        // 添加fade-in效果
        function checkVisibility() {
            newsItems.forEach(item => {
                if (isInViewport(item) && !item.classList.contains('visible')) {
                    item.classList.add('visible');
                }
            });
        }
        
        // 初始化样式
        newsItems.forEach(item => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            item.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        });
        
        // 当元素进入视口时添加visible类
        window.addEventListener('scroll', checkVisibility);
        window.addEventListener('resize', checkVisibility);
        
        // 初始检查
        setTimeout(checkVisibility, 100);
        
        // 给新闻标题添加悬停效果
        document.querySelectorAll('.news-item h2').forEach(title => {
            title.addEventListener('mouseover', function() {
                this.style.transform = 'translateX(5px)';
            });
            
            title.addEventListener('mouseout', function() {
                this.style.transform = 'translateX(0)';
            });
        });
        
        // 给visible类添加样式
        const style = document.createElement('style');
        style.textContent = `
            .news-item.visible {
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
            
            .news-item h2 {
                transition: transform 0.3s ease;
            }
        `;
        document.head.appendChild(style);
    }
    
    // 添加DeepSeek搜索功能
    function addDeepSeekSearchFunctionality() {
        // 首先尝试获取带news-title类的元素
        let newsTitles = document.querySelectorAll('.news-title');
        
        // 如果没有找到，则获取news-item下的h2标签
        if (newsTitles.length === 0) {
            newsTitles = document.querySelectorAll('.news-item h2');
            console.log('未找到.news-title元素，使用.news-item h2元素代替');
        }
        
        newsTitles.forEach(title => {
            title.style.cursor = 'default'; // 修改鼠标样式为默认
            
            // 获取或创建搜索图标
            let searchIcon = title.querySelector('.search-deepseek-icon');
            
            // 如果标题中没有搜索图标，则创建一个
            if (!searchIcon) {
                searchIcon = document.createElement('i');
                searchIcon.className = 'fas fa-search-plus search-deepseek-icon';
                searchIcon.title = '使用DeepSeek搜索相关信息';
                searchIcon.style.marginLeft = '8px';
                searchIcon.style.fontSize = '0.8em';
                searchIcon.style.color = '#e71f19';
                searchIcon.style.opacity = '0.7';
                searchIcon.style.cursor = 'pointer';
                searchIcon.style.transition = 'all 0.3s ease';
                title.appendChild(searchIcon);
            }
            
            // 为搜索图标添加点击事件
            searchIcon.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation(); // 防止事件冒泡
                
                // 获取标题文本 - 从data-title属性或者直接从标题文本中提取
                let titleText = title.getAttribute('data-title');
                
                // 如果没有data-title属性，则使用标题文本
                if (!titleText) {
                    // 提取标题，移除编号部分
                    titleText = title.textContent.trim();
                    // 移除搜索图标的文本
                    titleText = titleText.replace(/\s*使用DeepSeek搜索相关信息\s*$/, '');
                    // 试图移除数字前缀
                    titleText = titleText.replace(/^\d+[、,.]\s*/, '');
                }

                // 特殊处理，确保Gemini关键词完整包含在搜索内容中
                if (titleText.includes('Gemini')) {
                    // 对于包含Gemini的标题，确保完整保留关键部分
                    if (titleText.includes('GPT、Gemini、Grok')) {
                        // 确保完整保留"GPT、Gemini、Grok争做最佳"这个短语
                        const fullPhrase = titleText.match(/GPT、Gemini、Grok[^，。；！？:]*/) || [];
                        if (fullPhrase[0]) {
                            // 使用匹配到的完整短语
                            titleText = "大语言模型变身软体机器人设计「自然选择器」，" + fullPhrase[0]; 
                        }
                    } else {
                        // 对于其他包含Gemini的标题，确保上下文完整
                        const geminiIndex = titleText.indexOf('Gemini');
                        const startPos = Math.max(0, geminiIndex - 20);
                        titleText = titleText.substring(startPos);
                    }
                }
                
                console.log("DeepSeek搜索的标题：", titleText);
                
                // 构建prompt并编码
                const prompt = encodeURIComponent(`根据以下信息搜集全网最新资料，并进行专业解读。信息：${titleText}`);
                
                // 构建URL并打开新窗口
                const url = `https://chat.baidu.com/search?word=${prompt}`;
                window.open(url, '_blank');
            });
            
            // 添加悬停效果
            searchIcon.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.2)';
                this.style.opacity = '1';
                this.title = '点击使用百度DeepSeek搜索解读此新闻';
            });
            
            searchIcon.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
                this.style.opacity = '0.7';
            });
        });
    }
});