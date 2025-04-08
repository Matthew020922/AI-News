const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const express = require('express');
const cron = require('node-cron');
const { OpenAI } = require('openai');

// 初始化Express应用
const app = express();
// 添加JSON解析中间件
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 创建RSS解析器实例
const parser = new Parser({
  timeout: 60000, // 增加超时时间到60秒
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  }
});

// 配置静态文件目录
app.use(express.static(path.join(__dirname)));

// 用于AI摘要生成的配置
// 注意：使用豆包API替代OpenAI API
let openai = null;
try {
  // 使用豆包API初始化
  openai = new OpenAI({
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: "873356b4-deea-4c26-bf75-6f0c751d4f54",
    timeout: 30000
  });
  console.log('豆包API初始化成功，将使用AI摘要功能');
} catch (error) {
  console.error('豆包API初始化失败:', error);
  console.log('将使用简单摘要功能');
}

// RSS源列表 - 根据用户需求进行配置
// 定义常量
const ARCHIVE_DIR = path.join(__dirname, "archives");
const LOG_DIR = path.join(__dirname, "logs");
const ACCESS_LOG_PATH = path.join(LOG_DIR, "access.log");
const ERROR_LOG_PATH = path.join(LOG_DIR, "error.log");
const CURRENT_REPORT_PATH = path.join(__dirname, "current-report.json");

const RSS_SOURCES = [
  { 
    url: 'https://wechat2rss.xlab.app/feed/7131b577c61365cb47e81000738c10d872685908.xml', 
    category: 'ai-tech', 
    name: '量子位(微信)',
    useHtml: true,  // 使用HTML内容
    priorityContent: ['content:encoded', 'content', 'description', 'contentSnippet', 'summary']
  },
  { 
    url: 'https://www.jiqizhixin.com/rss', 
    category: 'ai-research', 
    name: '机器之心',
    useHtml: true,
    priorityContent: ['content:encoded', 'content', 'description', 'contentSnippet', 'summary']
  },
  { 
    url: 'https://chenz.zeabur.app/feeds/MP_WXS_3871912638.atom', 
    category: 'ai-industry', 
    name: 'AI寒武纪',
    useHtml: true,
    priorityContent: ['content', 'content:encoded', 'description', 'contentSnippet', 'summary']
  },
  { 
    url: 'https://rsshub.rssforever.com/36kr/motif/327686782977', 
    category: 'ai-tech',
    name: '36Kr科技',
    useHtml: true,
    fetchTimeout: 120000, // 增加超时时间到120秒
    priorityContent: ['content', 'description', 'contentSnippet', 'summary']
  }
];

if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 简单日志函数
function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[INFO][${timestamp}] ${message}`);
  fs.appendFileSync(ACCESS_LOG_PATH, `[INFO][${timestamp}] ${message}\n`);
}

function logError(message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[ERROR][${timestamp}] ${message}`, error);
  fs.appendFileSync(ERROR_LOG_PATH, `[ERROR][${timestamp}] ${message} ${error ? error.stack || error.message || JSON.stringify(error) : ''}\n`);
}

// 格式化日期为"YYYY-MM-DD"
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 生成中文显示日期格式（如：3月28日）
function formatChineseDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

// 从内容中提取AI摘要
async function generateAISummary(content, title = '', sourceName = '') {
  try {
    // 如果初始化失败，则使用简单的摘要生成
    if (!openai) {
      return createSimpleSummary(content, title);
    }

    // 如果内容太短，添加标题作为补充
    let textToSummarize = content;
    
    // 规范化内容，将多个空格替换为单个空格
    textToSummarize = textToSummarize.replace(/\s+/g, ' ').trim();
    
    // 检查内容长度，根据长度采取不同策略
    if (textToSummarize.length < 30) {
      if (title) {
        logInfo(`内容较短(${content.length}字符)，添加标题作为补充内容`);
        textToSummarize = title + ": " + textToSummarize;
      }
      
      // 如果内容加上标题仍然太短
      if (textToSummarize.length < 30) {
        // 尝试构建一个基于可用信息的简短摘要
        logInfo(`内容极短(${textToSummarize.length}字符)，构建基于标题的简单摘要`);
        
        // 构建提示，明确要求基于有限信息生成摘要
        const prompt = `这是一条关于"${title}"的新闻，但内容非常有限。请基于标题和以下短内容提炼3个合理的要点:\n\n${textToSummarize}`;
        
        try {
          const limitedResponse = await openai.chat.completions.create({
            model: "doubao-1-5-pro-32k-250115",
            messages: [
              {
                role: "system",
                content: "你是一个AI新闻分析专家。当面对信息有限的情况下，你能根据有限的线索推断出可能的要点。每个要点请添加一个随机表情符号(✨🌍💰等)开头，每点不超过60个字，必须是完整的一句话。即使信息有限，也尽量提供有价值的见解。"
              },
              {
                role: "user",
                content: prompt
              }
            ],
            max_tokens: 350,
            timeout: 30000
          });
          
          const limitedSummary = limitedResponse.choices[0].message.content
            .split('\n')
            .filter(line => line.trim().length > 0);
          
          if (limitedSummary.length > 0) {
            logInfo(`成功基于有限信息生成摘要，包含 ${limitedSummary.length} 个要点`);
            return limitedSummary;
          }
        } catch (err) {
          logError(`基于有限信息生成摘要失败:`, err);
        }
        
        // 如果特殊处理失败，回退到简单摘要
        return createSimpleSummary(textToSummarize, title);
      }
    }

    // 如果内容仍然太短，无法生成有意义的摘要
    if (textToSummarize.length < 15) {
      logError(`内容过短(${textToSummarize.length}字符)，无法生成有意义的摘要，使用本地方法`, null);
      return createSimpleSummary(textToSummarize, title);
    }

    const response = await openai.chat.completions.create({
      // 使用豆包模型
      model: "doubao-1-5-pro-32k-250115",
      messages: [
        {
          role: "system",
          content: "你是一个AI新闻摘要专家。请从输入的新闻内容中提取3个最重要的核心信息点，每点不超过60个字，必须是完整的一句话。为每个要点添加一个随机表情符号(✨🌍💰🏢🚗✈️🏠📈🌲🔍💼🧠💡🤖🛒🎯🔔🎮等)开头。摘要应该聚焦于具体数据、核心信息或分析结论，避免空泛的内容。如果内容较短，可从有限信息中提炼要点。请直接返回3个要点，每个要点一行，不要添加任何其他内容。"
        },
        {
          role: "user",
          content: `请从以下${sourceName ? sourceName + '的' : ''}新闻内容中提取3个最重要的核心信息点:\n\n${title ? '标题: ' + title + '\n\n' : ''}内容: ${textToSummarize}`
        }
      ],
      max_tokens: 350,
      timeout: 30000
    });
    
    const summary = response.choices[0].message.content
      .split('\n')
      .filter(line => line.trim().length > 0);
    
    if (summary.length === 0) {
      logError('API返回的摘要为空，使用本地方法', null);
      return createSimpleSummary(textToSummarize, title);
    }
    
    return summary;
  } catch (error) {
    logError('生成AI摘要失败:', error);
    return createSimpleSummary(content, title);
  }
}

// 简单摘要生成方法（作为备选）
function createSimpleSummary(content, title = '') {
  // 结合标题和内容
  const fullText = title ? title + ": " + content : content;
  
  // 提取前三个句子作为摘要
  const sentences = fullText.split(/[.。!！?？]/).filter(s => s.trim().length > 0).slice(0, 3);
  
  // 为每个摘要句子添加随机emoji
  const emojis = ['✨', '🌍', '💰', '🏢', '🚗', '✈️', '🏠', '📈', '🌲', '🔍', '💼', '🧠', '💡', '🤖', '🛒', '🎯', '🔔', '🎮'];
  
  if (sentences.length === 0) {
    // 如果没有足够的句子，返回一个基于标题的提示
    if (title) {
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      return [`${randomEmoji} 这是关于"${title}"的新闻，但内容较少，建议查看原文获取更多信息`];
    }
    // 如果连标题都没有，返回一个通用提示
    return [`${emojis[Math.floor(Math.random() * emojis.length)]} 此内容过短，请查看原文获取更多信息`];
  }
  
  return sentences.map((s, index) => {
    // 随机选择emoji
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    // 限制句子长度不超过60个字
    let sentence = s.trim();
    if (sentence.length > 60) {
      sentence = sentence.substring(0, 57) + '...';
    }
    
    return `${randomEmoji} ${sentence}`;
  });
}

// 从RSS源获取新闻
async function fetchNewsFromRSS() {
  logInfo('开始从RSS源获取新闻...');
  const allNewsItems = [];
  
  for (const source of RSS_SOURCES) {
    logInfo(`正在处理RSS源: ${source.name} (${source.url})`);
    try {
      // 添加超时设置并获取RSS数据
      const feed = await parser.parseURL(source.url);
      logInfo(`成功获取 ${source.name} 的RSS数据，包含 ${feed.items ? feed.items.length : 0} 条项目`);
      
      if (!feed.items || feed.items.length === 0) {
        logError(`警告: ${source.name} 返回了空的items数组`, null);
        continue;
      }
      
      let addedCount = 0;
      for (let i = 0; i < feed.items.length; i++) {
        const item = feed.items[i];
        try {
          // 添加更详细的日志和空值检查
          if (!item.title) {
            logError(`警告: 在 ${source.name} 的第 ${i+1} 项中发现标题为空`, null);
            continue;
          }
          
          // 尝试获取内容，处理不同的内容字段格式
          let content = '';
          
          // 根据源配置的优先级获取内容
          const contentFields = source.priorityContent || ['content:encoded', 'content', 'description', 'contentSnippet', 'summary'];
          
          for (const field of contentFields) {
            if (item[field] && item[field].trim().length > 0) {
              content = item[field];
              logInfo(`从 ${source.name} 的第 ${i+1} 项中使用 ${field} 字段获取内容，长度: ${content.length}`);
              break;
            }
          }
          
          // 如果没有找到任何内容，尝试其他可能的字段
          if (content.length === 0) {
            // 尝试额外的字段，有些RSS源可能使用非标准字段
            const extraFields = ['body', 'description:encoded', 'encoded', 'fullContent', 'text'];
            for (const field of extraFields) {
              if (item[field] && item[field].trim().length > 0) {
                content = item[field];
                logInfo(`从 ${source.name} 的第 ${i+1} 项中使用额外字段 ${field} 获取内容`);
                break;
              }
            }
          }
          
          // 尝试从link获取内容（对于某些只提供链接的RSS）
          if (content.length < 100 && item.link && source.fetchContent) {
            try {
              logInfo(`${source.name} 的第 ${i+1} 项内容太短(${content.length}字符)，尝试从链接获取内容`);
              const response = await fetch(item.link, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Node.js RSS Reader)' },
                timeout: 10000
              });
              
              if (response.ok) {
                const html = await response.text();
                // 使用简单的方法提取正文内容，实际中可能需要更复杂的逻辑
                const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
                if (bodyMatch && bodyMatch[1]) {
                  // 移除脚本和样式
                  let bodyContent = bodyMatch[1]
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
                  
                  // 提取主要内容区域（简单实现，实际需要更复杂的逻辑）
                  const contentMatches = /<article[^>]*>([\s\S]*?)<\/article>|<div[^>]*?content[^>]*>([\s\S]*?)<\/div>|<div[^>]*?main[^>]*>([\s\S]*?)<\/div>/i.exec(bodyContent);
                  
                  if (contentMatches) {
                    const extractedContent = contentMatches.find(m => m && m.length > 100) || bodyContent;
                    // 移除HTML标签
                    content = extractedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    logInfo(`成功从链接获取内容，长度: ${content.length}`);
                  }
                }
              }
            } catch (fetchError) {
              logError(`从链接获取内容失败: ${fetchError.message}`, null);
            }
          }
          
          // 处理HTML内容
          if (content.includes('<') && content.includes('>') && source.useHtml) {
            logInfo(`处理HTML内容，原始长度: ${content.length}`);
            
            // 移除脚本、样式和注释
            content = content
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<!--[\s\S]*?-->/g, '');
            
            // 保留段落结构
            content = content
              .replace(/<\/p>/gi, '\n')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/div>/gi, '\n')
              .replace(/<\/h[1-6]>/gi, '\n')
              .replace(/<\/li>/gi, '\n');
            
            // 保留重要信息，比如链接文本
            content = content
              .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 $1')
              .replace(/<img\s+(?:[^>]*?\s+)?alt="([^"]*)"[^>]*?>/gi, '$1');
            
            // 移除所有剩余HTML标签
            content = content.replace(/<[^>]*>/g, ' ');
            
            // 处理HTML实体
            content = content.replace(/&nbsp;/g, ' ')
                           .replace(/&lt;/g, '<')
                           .replace(/&gt;/g, '>')
                           .replace(/&amp;/g, '&')
                           .replace(/&quot;/g, '"')
                           .replace(/&apos;/g, "'")
                           .replace(/&#39;/g, "'")
                           .replace(/&mdash;/g, '-')
                           .replace(/&ldquo;/g, '"')
                           .replace(/&rdquo;/g, '"');
            
            // 规范化空白字符
            content = content.replace(/\s+/g, ' ').trim();
            
            // 处理CDATA
            content = content.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
            
            logInfo(`HTML处理后的内容长度: ${content.length}`);
          }
          
          // 如果内容仍然为空，则至少使用标题
          if (content.length === 0) {
            content = item.title;
            logInfo(`${source.name} 的第 ${i+1} 项内容为空，使用标题作为内容`);
          }
          
          // 处理不同的日期格式
          let pubDate;
          if (item.pubDate) {
            pubDate = new Date(item.pubDate);
          } else if (item.published) {
            // Atom格式可能使用published字段
            pubDate = new Date(item.published);
          } else if (item.updated) {
            // 备选字段
            pubDate = new Date(item.updated);
          } else {
            // 如果没有日期，使用当前时间
            logError(`警告: 在 ${source.name} 的第 ${i+1} 项中没有找到日期，使用当前时间`, null);
            pubDate = new Date();
          }
          
          // 验证日期有效性
          if (isNaN(pubDate.getTime())) {
            logError(`警告: 在 ${source.name} 的第 ${i+1} 项中日期无效，使用当前时间`, null);
            pubDate = new Date();
          }
          
          // 获取链接
          let link = item.link || '';
          if (!link && item.guid && item.guid.startsWith('http')) {
            // 某些RSS可能将URL放在guid中
            link = item.guid;
          }
          
          const newsItem = {
            title: item.title,
            content: content,
            pubDate: pubDate,
            link: link,
            category: source.category,
            source_name: source.name
          };
          
          // 对于36Kr等多行业的新闻源，降低内容长度要求
          const minContentLength = source.name === '36Kr综合资讯' ? 50 : 100;
          
          // 只添加内容长度合理的条目
          if (content.length >= minContentLength) {
            allNewsItems.push(newsItem);
            addedCount++;
            logInfo(`添加了 ${source.name} 的第 ${i+1} 项，内容长度: ${content.length}`);
          } else {
            logInfo(`跳过 ${source.name} 的第 ${i+1} 项，内容过短: ${content.length} 字符`);
          }
        } catch (itemError) {
          logError(`处理 ${source.name} 的第 ${i+1} 项时出错:`, itemError);
          continue;
        }
      }
      
      logInfo(`从 ${source.name} 成功添加了 ${addedCount} 条新闻项到列表中`);
    } catch (error) {
      logError(`从 ${source.name} (${source.url}) 获取RSS时出错:`, error);
    }
  }
  
  logInfo(`所有RSS源处理完成，共获取 ${allNewsItems.length} 条新闻项`);
  
  // 添加详细日志
  if (allNewsItems.length === 0) {
    logError('警告: 没有从任何RSS源获取到新闻项', null);
  }
  
  // 按发布日期排序（最新的在前）
  const sortedItems = allNewsItems.sort((a, b) => b.pubDate - a.pubDate);
  logInfo(`新闻按日期排序完成，最新日期: ${sortedItems.length > 0 ? sortedItems[0].pubDate : '无数据'}`);
  
  return sortedItems;
}

// 处理单个新闻项生成完整的新闻对象
async function processNewsItem(item, index) {
  // 提取关键词 - 优先使用豆包API提取名词关键词
  let keywords = '';
  
  // 从标题和内容中提取文本
  const title = item.title || '';
  let content = item.content || '';
  const sourceName = item.source_name || '未知来源';
  
  logInfo(`正在处理第${index + 1}条新闻: ${title.substring(0, 30)}... (来源: ${sourceName})`);
  
  // 检查内容长度是否足够
  if (content.length < 300) {
    logInfo(`新闻内容长度不足300字(实际${content.length}字)，标记为不合格内容`);
    return {
      id: `news${index + 1}`,
      number: index + 1,
      title: `${index + 1}、${item.title}`,
      content: content,
      contentLengthSufficient: false, // 标记内容长度不足
      source: item.link,
      category: item.category,
      source_name: sourceName
    };
  }
  
  // 保存完整内容用于摘要生成
  const fullContent = content;
  
  // 将显示内容限制为250字
  if (content.length > 250) {
    content = content.substring(0, 247) + '...';
    logInfo(`限制显示内容长度为250字`);
  }
  
  // 合并标题和内容前部分用于关键词提取
  const textForKeywords = title + ' ' + fullContent.substring(0, 200);
  
  try {
    // 尝试使用豆包API提取关键词
    if (openai) {
      try {
        logInfo(`正在使用豆包API为新闻提取关键词: ${title.substring(0, 30)}...`);
        const response = await openai.chat.completions.create({
          model: "doubao-1-5-pro-32k-250115",
          messages: [
            {
              role: "system",
              content: "你是一个专业的新闻关键词提取工具。你的任务是从新闻文本中提取2-3个极简短的名词关键词。每个关键词必须是纯名词，且不超过4个汉字。重点关注：1)公司名称(如'阿里'、'百度')，2)行业领域(如'芯片'、'AI')，3)技术概念(如'大模型'、'AGI')。请严格遵守每个关键词不超过4个汉字的限制。只返回这些关键词，用空格分隔，不要包含任何其他解释或内容。"
            },
            {
              role: "user",
              content: `请从以下新闻文本中提取2-3个名词关键词，用空格分隔。这条新闻来自"${sourceName}":\n\n${textForKeywords}`
            }
          ],
          max_tokens: 50,
          timeout: 30000
        });
        
        // 提取并清理关键词
        const extractedKeywords = response.choices[0].message.content.trim();
        logInfo(`豆包API提取的关键词: ${extractedKeywords}`);
        
        if (extractedKeywords && extractedKeywords.length > 0) {
          // 成功使用豆包API提取到关键词
          keywords = extractedKeywords;
          
          // 生成优化的AI摘要
          try {
            logInfo(`正在为新闻生成AI摘要: ${title.substring(0, 30)}...`);
            
            const summaryResponse = await openai.chat.completions.create({
              model: "doubao-1-5-pro-32k-250115",
              messages: [
                {
                  role: "system",
                  content: "你是一个AI新闻摘要专家。请从输入的新闻内容中提取3个最重要的核心信息点，每点不超过60个字，必须是完整的一句话。为每个要点添加一个随机表情符号(✨🌍💰🏢🚗✈️🏠📈🌲🔍💼🧠💡🤖🛒🎯🔔🎮等)开头。摘要应该聚焦于具体数据、核心信息或分析结论，避免空泛的内容。如果内容较短，可从有限信息中提炼要点。请直接返回3个要点，每个要点一行，不要添加任何其他内容。"
                },
                {
                  role: "user",
                  content: `请从以下AI新闻内容中提取3个最重要的核心信息点,每点不超过60个字,为每点添加一个随机表情符号开头。这条新闻来自"${sourceName}":\n\n标题: ${title}\n\n内容: ${fullContent}`
                }
              ],
              max_tokens: 350,
              timeout: 30000
            });
            
            const summary = summaryResponse.choices[0].message.content
              .split('\n')
              .filter(line => line.trim().length > 0);
            
            if (summary.length > 0) {
              logInfo(`成功生成摘要，包含 ${summary.length} 个要点`);
              return {
                id: `news${index + 1}`,
                number: index + 1,
                title: `${index + 1}、${item.title}`,
                keywords: keywords,
                content: content,
                contentLengthSufficient: true, // 标记内容长度足够
                summary: summary,
                source: item.link,
                category: item.category,
                source_name: sourceName
              };
            } else {
              logError(`警告: 摘要生成结果为空，将使用备选方法`, null);
            }
          } catch (summaryError) {
            logError('生成优化AI摘要失败:', summaryError);
            // 如果摘要生成失败，将使用备选方法
          }
        }
      } catch (aiError) {
        logError('使用豆包API提取关键词失败:', aiError);
        // 失败时继续使用本地方法
      }
    }
    
    // 如果豆包API没有成功提取关键词，使用本地方法
    logInfo('使用本地方法提取关键词...');
    
    // 常见的无意义词和停用词
    const stopWords = [
      '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', 
      '着', '没有', '看', '好', '自己', '这', '那', '这个', '那个', '啊', '吧', '呢', '没', '很多', '太', '吗', '年', '月', '日', '将', '能', 
      '可能', '表示', '认为', '如何', '什么', '这样', '那样', '只是', '但是', '因为', '所以', '如果', '虽然', '然而', '于是', '可以', '已经',
      '通过', '需要', '成为', '提供', '包括', '等', '等等', '以及', '或者', '比如', '例如', '还有', '其他', '一些', '这些', '那些', '为', '被',
      '获悉', '美元', '元', '万', '亿', '超', '达', '约', '预计', '同比', '环比', '增长', '下降', '发布', '公布', '消息', 
      '消息称', '报道', '报道称', '报告', '报告显示', '数据', '数据显示', '研究', '研究显示', '调查', '调查显示', '来源', '来自', 
      '发稿', '截至', '截至发稿', '公告', '内容', '显示', '称', '记者', '编辑', '36氪', '36kr', '获悉', '分析', '专家', '技术', 
      '市场', '企业', '产品', '投资', '项目', '发展', '公司', '行业', '领域', '计划', '实现', '应用', '服务', '未来', '创新',
      '全球', '中国', '国内', '国际', '世界', '地区', '时间', '日期', '今天', '昨天', '明天'
    ];
    
    // 按照空格、标点等分割文本
    const allWords = textForKeywords.split(/[\s,.，。:：;；!！?？\-()（）'"'""【】［］\/]/);
    
    // 过滤掉停用词、太短的词以及纯数字，并计算词频
    const wordFreq = {};
    allWords.forEach(word => {
      word = word.trim();
      // 忽略纯数字
      if (word && word.length >= 2 && !stopWords.includes(word) && !/^\d+$/.test(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    
    // 按词频排序并取前3个作为关键词
    let sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
    
    // 如果提取到的关键词太长，截断为更简洁的形式
    sortedWords = sortedWords.map(word => {
      if (word.length > 4) {
        return word.substring(0, 4);
      }
      return word;
    });
    
    // 如果没有提取到关键词，使用标题的前几个字
    if (sortedWords.length === 0 && title.length > 0) {
      const shortTitle = title.slice(0, 10).trim();
      sortedWords = [shortTitle];
    }
    
    keywords = sortedWords.join(' ');
    logInfo(`本地方法提取的关键词: ${keywords}`);
    
  } catch (error) {
    logError('关键词提取过程中发生错误:', error);
    // 如果出错，使用标题的前几个字作为关键词
    keywords = item.title ? item.title.substring(0, 4).trim() : '未知主题';
  }
  
  // 生成AI摘要
  const summary = await generateAISummary(content, title, sourceName);
  
  return {
    id: `news${index + 1}`,
    number: index + 1,
    title: `${index + 1}、${item.title}`,
    keywords: keywords,
    content: content,
    contentLengthSufficient: true, // 标记内容长度足够
    summary: summary,
    source: item.link,
    category: item.category,
    source_name: sourceName
  };
}

// 生成当天日报
async function generateDailyReport(targetDate) {
  try {
    const today = targetDate ? new Date(targetDate) : new Date();
    logInfo(`开始生成${formatChineseDate(today)}AI日报...`);
    
    const formattedDate = formatDate(today);
    const chineseDate = formatChineseDate(today);
    const newsItems = await fetchNewsFromRSS();
    
    // 指定日期的零点和23:59:59
    const targetStartTime = new Date(today);
    targetStartTime.setHours(0, 0, 0, 0);
    
    const targetEndTime = new Date(today);
    targetEndTime.setHours(23, 59, 59, 999);
    
    logInfo(`筛选${targetStartTime.toISOString()}到${targetEndTime.toISOString()}的新闻`);
    
    // 严格按照日期筛选新闻 - 只获取当天的新闻
    const todayNews = newsItems.filter(item => {
      const pubDate = new Date(item.pubDate);
      return pubDate >= targetStartTime && pubDate <= targetEndTime;
    });
    
    logInfo(`当天日期 ${formattedDate} 筛选后得到 ${todayNews.length} 条新闻`);
    
    // 如果当天新闻数量太少，则添加备选新闻（最近3天的）用于分析，但优先展示当天的
    let additionalNews = [];
    if (todayNews.length < 8) {
      // 创建三天前的日期
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      logInfo(`当天新闻数量不足8条，添加${threeDaysAgo.toISOString()}到${targetStartTime.toISOString()}的备选新闻`);
      
      // 获取三天前到今天零点之间的新闻
      additionalNews = newsItems.filter(item => {
        const pubDate = new Date(item.pubDate);
        return pubDate >= threeDaysAgo && pubDate < targetStartTime;
      });
      
      logInfo(`额外获取到 ${additionalNews.length} 条备选新闻`);
    }
    
    // 合并新闻，当天的放在前面
    const allCandidateNews = [...todayNews, ...additionalNews];
    
    // 按来源分组新闻
    const newsBySource = {};
    allCandidateNews.forEach(item => {
      const sourceName = item.source_name || '未知来源';
      if (!newsBySource[sourceName]) {
        newsBySource[sourceName] = [];
      }
      newsBySource[sourceName].push(item);
    });
    
    // 记录各来源的新闻数量
    Object.entries(newsBySource).forEach(([source, items]) => {
      logInfo(`来源 ${source} 有 ${items.length} 条新闻`);
    });
    
    // 过滤出AI相关新闻，同时确保各来源都有代表
    let aiNews = [];
    
    // 定义AI相关关键词 - 扩展关键词列表
    const aiKeywords = ['ai', '人工智能', '大模型', 'llm', 'chatgpt', 'gpt', '机器学习', 
                     '深度学习', '神经网络', '算法', '模型', 'openai', '语音识别', 
                     '图像识别', '计算机视觉', '自然语言处理', 'nlp', '智能', '百度', 
                     '阿里', '腾讯', '字节跳动', '谷歌', '微软', 'meta', '融资', 
                     'agora', '元宇宙', 'web3', '智谱', 'claude', 'gemini', '技术', 
                     '突破', '智能体', 'agent', '大厂', '智能化', '数据', '大厂',
                     '前沿', '迭代', '创新', '芯片', '算力', '训练', '推理', '人形机器人',
                     '量子', '生成式', '多模态', '对话', '科技', '论文', '发布', 'stable diffusion',
                     '自动驾驶', '智能制造', '智慧城市', '数据中心', '云计算', '边缘计算', 
                     '区块链', '机器人', '自动化', '互联网', '大数据', '云服务',
                     '科大讯飞', '商汤', '旷视', '优必选', '思必驰', '出门问问', '地平线', 
                     'anthropic', 'nvidia', 'amd', 'intel', 'qualcomm', 'arm', '华为', '飞桨',
                     '昇腾', '鸿蒙', '昆仑', '寒武纪', '澎峰', '中科创达'];
    
    // 排除低优先级的新闻关键词
    const excludeKeywords = ['噱头', '炒作', '概念', '宣传', '营销'];
    
    // 高优先级筛选
    const highPriorityKeywords = ['技术突破', '新模型', '发布', '融资', '收购', '大厂', 
                               '芯片', '模型迭代', '前沿', '重大', '政策', 'AI产品'];
    
    // 从每个来源选择AI相关新闻
    Object.entries(newsBySource).forEach(([source, items]) => {
      // 对于AI专业媒体，假设所有内容都与AI相关
      const isAIMedia = ['量子位', '机器之心', 'AI寒武纪'].includes(source);
      
      // 按AI相关性过滤
      const sourceAiNews = items.filter(item => {
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        
        // 对于AI专业媒体，只要内容长度足够就通过
        if (isAIMedia) {
          return (item.content || '').length >= 100;
        }
        
        // 对于36Kr等综合媒体，进行关键词筛选
        // 检查是否是高优先级新闻或包含普通AI关键词
        const isHighPriority = highPriorityKeywords.some(keyword => 
          title.includes(keyword.toLowerCase()) || content.includes(keyword.toLowerCase()));
        
        // 进行严格的AI相关性检查
        const containsAIKeyword = aiKeywords.some(keyword => 
          title.includes(keyword.toLowerCase()) || content.includes(keyword.toLowerCase()));
        
        // 特殊检查：对于36Kr和新智元的内容，必须进行严格的AI关键词检查
        const isSpecialSource = source === '36Kr综合资讯' || source === '新智元';
        
        // 检查是否包含排除的关键词
        const containsExcludedKeyword = excludeKeywords.some(keyword => 
          title.includes(keyword.toLowerCase()) || content.includes(keyword.toLowerCase()));
        
        // 检查内容长度是否足够 - 对36Kr降低要求
        const minContentLength = source === '36Kr综合资讯' ? 120 : 180;
        const contentLengthSufficient = (item.content || '').length >= minContentLength;
        
        // 优先选择高优先级新闻，同时排除噱头新闻和内容过短的新闻
        // 对于特殊来源，必须包含AI关键词
        const passesFilter = isSpecialSource ? 
          (contentLengthSufficient && containsAIKeyword && !containsExcludedKeyword) :
          (contentLengthSufficient && (isHighPriority || containsAIKeyword) && !containsExcludedKeyword);
        
        return passesFilter;
      });
      
      // 从每个来源选择至少1-5条新闻（视具体情况而定）
      if (sourceAiNews.length > 0) {
        const maxItemsPerSource = Math.min(sourceAiNews.length, source === '36Kr综合资讯' ? 6 : 4);
        const selectedItems = sourceAiNews.slice(0, maxItemsPerSource);
        logInfo(`从来源 ${source} 选择了 ${selectedItems.length} 条AI相关新闻`);
        aiNews = aiNews.concat(selectedItems);
      } else {
        logInfo(`来源 ${source} 没有找到符合条件的AI相关新闻`);
      }
    });
    
    logInfo(`总共筛选出${aiNews.length}条内容充足的AI相关新闻`);
    
    // 优先排序当天的新闻
    aiNews.sort((a, b) => {
      const pubDateA = new Date(a.pubDate);
      const pubDateB = new Date(b.pubDate);
      
      // 首先比较是否是当天新闻
      const isTodayA = pubDateA >= targetStartTime && pubDateA <= targetEndTime;
      const isTodayB = pubDateB >= targetStartTime && pubDateB <= targetEndTime;
      
      if (isTodayA !== isTodayB) {
        return isTodayA ? -1 : 1; // 当天的新闻优先
      }
      
      // 如果同为当天或同为非当天，按优先级和内容长度排序
      const titleA = (a.title || '').toLowerCase();
      const contentA = (a.content || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      const contentB = (b.content || '').toLowerCase();
      
      // 检查是否是高优先级新闻
      const isHighPriorityA = highPriorityKeywords.some(keyword => 
        titleA.includes(keyword.toLowerCase()) || contentA.includes(keyword.toLowerCase()));
      
      const isHighPriorityB = highPriorityKeywords.some(keyword => 
        titleB.includes(keyword.toLowerCase()) || contentB.includes(keyword.toLowerCase()));
      
      // 优先级不同，高优先级排前面
      if (isHighPriorityA !== isHighPriorityB) {
        return isHighPriorityA ? -1 : 1;
      }
      
      // 优先级相同，再比较内容长度，内容更长的排前面
      const contentLengthA = (a.content || '').length;
      const contentLengthB = (b.content || '').length;
      
      if (Math.abs(contentLengthA - contentLengthB) > 100) {  // 内容长度差异显著
        return contentLengthB - contentLengthA;
      }
      
      // 内容长度相近，按日期排序
      return pubDateB - pubDateA;
    });
    
    // 选择前15-20条新闻，确保内容充足
    const maxNewsCount = Math.min(aiNews.length, 20);
    const selectedNews = aiNews.slice(0, maxNewsCount);
    logInfo(`选择了前${selectedNews.length}条新闻进行处理`);
    
    // 处理所有选定的新闻项
    const processedNews = await Promise.all(
      selectedNews.map((item, index) => processNewsItem(item, index))
    );
    
    // 处理单个新闻项处理时对内容长度的判断标准为300字符，这里放宽对36Kr文章的要求
    const finalNews = processedNews.filter(item => {
      if (item.source_name === '36Kr综合资讯') {
        return item.contentLengthSufficient || item.content.length >= 120;
      }
      return item.contentLengthSufficient;
    });
    
    logInfo(`最终保留${finalNews.length}条内容充足的新闻项`);
    
    // 如果筛选后数量不足，添加警告日志
    if (finalNews.length < 5) {
      logError(`警告: 筛选后新闻数量偏少(${finalNews.length}条)，可能需要调整筛选条件或添加更多RSS源`, null);
    }
    
    // 重新编号
    finalNews.forEach((item, index) => {
      item.number = index + 1;
      // 修复标题格式，确保格式一致，但保留完整标题
      let titleContent = item.title || '';
      // 使用正则表达式匹配开头的数字+、格式（确保只匹配标题开头的编号）
      if (/^\d+、/.test(titleContent)) {
        // 如果标题已经有编号格式（如"1、标题内容"），则只保留标题内容部分
        titleContent = titleContent.replace(/^\d+、/, '');
      }
      // 统一为"序号、内容"格式
      item.title = `${index + 1}、${titleContent}`;
      item.id = `news${index + 1}`;
    });
    
    // 生成日报主标题
    let mainTitle;
    if (finalNews.length >= 3) {
      // 如果有足够的新闻，组合前3条标题
      // 获取前三条新闻的标题（去除编号）
      const firstTitle = finalNews[0].title.split('、')[1];
      const secondTitle = finalNews.length > 1 ? finalNews[1].title.split('、')[1] : '';
      let thirdTitle = '';
      
      if (finalNews.length > 2) {
        const fullThirdTitle = finalNews[2].title.split('、')[1];
        thirdTitle = fullThirdTitle;
      }
      
      mainTitle = `AI日报: ${firstTitle}; ${secondTitle}; ${thirdTitle}`;
    } else if (finalNews.length > 0) {
      // 如果新闻数量有限，使用第一条标题
      const firstFullTitle = finalNews[0].title.split('、')[1];
      mainTitle = `AI日报: ${firstFullTitle}`;
    } else {
      // 如果没有新闻
      mainTitle = 'AI日报: 今日AI行业热点资讯';
    }
    
    // 生成日报数据
    const currentTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const reportData = {
      date: formattedDate,
      chineseDate: chineseDate,
      time: currentTime,
      title: mainTitle,
      news: finalNews,
      newsCount: finalNews.length
    };
    
    // 保存当前日报
    try {
      logInfo(`正在保存日报到 ${CURRENT_REPORT_PATH}`);
      fs.writeFileSync(CURRENT_REPORT_PATH, JSON.stringify(reportData, null, 2));
      logInfo('日报保存成功');
    } catch (error) {
      logError('保存日报时出错:', error);
      throw error;
    }
    
    return reportData;
  } catch (error) {
    logError('生成日报过程中发生错误:', error);
    throw error;
  }
}

// 归档日报
function archiveCurrentReport() {
  try {
    logInfo('开始归档当前日报');
    if (fs.existsSync(CURRENT_REPORT_PATH)) {
      const currentReport = JSON.parse(fs.readFileSync(CURRENT_REPORT_PATH, 'utf8'));
      const archivePath = path.join(ARCHIVE_DIR, `report-${currentReport.date}.json`);
      
      // 保存到归档
      fs.writeFileSync(archivePath, JSON.stringify(currentReport, null, 2));
      logInfo(`成功归档日报到 ${archivePath}`);
      
      return true;
    }
    logInfo('没有找到当前日报，无法归档');
    return false;
  } catch (error) {
    logError('归档当前日报失败:', error);
    return false;
  }
}

// 获取所有归档日报
function getArchivedReports() {
  try {
    logInfo('开始获取所有归档日报');
    const files = fs.readdirSync(ARCHIVE_DIR);
    const reports = [];
    
    // 获取当前日报的日期
    let currentDate = "";
    if (fs.existsSync(CURRENT_REPORT_PATH)) {
      try {
        const currentReport = JSON.parse(fs.readFileSync(CURRENT_REPORT_PATH, 'utf8'));
        currentDate = currentReport.date;
        logInfo(`当前日报日期: ${currentDate}，将在归档列表中排除该日期的日报`);
      } catch (err) {
        logError('读取当前日报失败，无法获取当前日期:', err);
      }
    }
    
    for (const file of files) {
      if (file.startsWith('report-') && file.endsWith('.json')) {
        const filePath = path.join(ARCHIVE_DIR, file);
        const reportData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // 排除当天的日报
        if (reportData.date === currentDate) {
          logInfo(`排除当天日报: ${file}`);
          continue;
        }
        reports.push({
          date: reportData.date,
          chineseDate: reportData.chineseDate,
          title: reportData.title,
          newsCount: reportData.newsCount,
          filePath: file
        });
      }
    }
    
    // 按日期排序（最新的在前）
    const sortedReports = reports.sort((a, b) => new Date(b.date) - new Date(a.date));
    logInfo(`找到${sortedReports.length}条归档日报（已排除当天日报）`);
    return sortedReports;
  } catch (error) {
    logError('获取归档日报列表失败:', error);
    return [];
  }
}

// API端点：获取当前日报
app.get('/api/current-report', (req, res) => {
  try {
    if (!fs.existsSync(CURRENT_REPORT_PATH)) {
      return res.status(404).json({ error: '当前没有可用的日报' });
    }
    
    const reportData = JSON.parse(fs.readFileSync(CURRENT_REPORT_PATH, 'utf8'));
    res.json(reportData);
  } catch (error) {
    logError('获取当前日报时出错:', error);
    res.status(500).json({ error: '获取当前日报时发生错误' });
  }
});

// API端点：获取归档日报列表
app.get('/api/archived-reports', (req, res) => {
  try {
    logInfo('请求获取归档日报列表');
    const reports = getArchivedReports();
    
    // 添加更多日志信息
    logInfo(`归档日报原始日期列表: ${reports.map(r => r.date).join(', ')}`);
    
    // 确保再次排序，避免任何排序问题
    const sortedReports = [...reports].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      
      logInfo(`比较日期: ${a.date} vs ${b.date} = ${dateB - dateA}`);
      return dateB - dateA;
    });
    
    logInfo(`归档日报排序后日期列表: ${sortedReports.map(r => r.date).join(', ')}`);
    logInfo(`成功返回${sortedReports.length}条归档日报数据`);
    
    res.json(sortedReports);
  } catch (error) {
    logError('获取归档日报列表失败:', error);
    res.status(500).json({ error: 'Failed to fetch archived reports' });
  }
});

// API端点：获取特定归档日报
app.get('/api/archived-reports/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    logInfo(`请求获取特定归档日报: ${filename}`);
    const filePath = path.join(ARCHIVE_DIR, filename);
    if (fs.existsSync(filePath)) {
      const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      logInfo(`成功返回归档日报: ${filename}`);
      res.json(report);
        } else {
      logError(`请求的归档日报不存在: ${filename}`, null);
      res.status(404).json({ error: 'Report not found' });
    }
  } catch (error) {
    logError('获取特定归档日报失败:', error);
    res.status(500).json({ error: 'Failed to fetch archived report' });
  }
});

// API端点：手动触发日报生成
app.post('/api/generate-report', async (req, res) => {
  try {
    logInfo('收到手动触发日报生成请求');
    const report = await generateDailyReport();
    logInfo('成功完成手动日报生成');
    res.json(report);
  } catch (error) {
    logError('手动生成日报失败:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// 新增：生成指定日期的日报
app.post('/api/generate-report-by-date', async (req, res) => {
  try {
    logInfo(`收到生成指定日期日报的请求: ${req.body.date}`);
    const targetDate = req.body.date; // 格式应为 YYYY-MM-DD
    
    if (!targetDate || !targetDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({ error: '日期格式不正确，应为YYYY-MM-DD' });
    }
    
    // 生成指定日期的日报
    const report = await generateDailyReport(targetDate);
    
    // 保存为当前日报（覆盖当前日报）
    fs.writeFileSync(CURRENT_REPORT_PATH, JSON.stringify(report, null, 2));
    
    res.json({ success: true, message: `成功生成${targetDate}的日报`, report });
  } catch (error) {
    logError(`生成${req.body.date}日报时出错:`, error);
    res.status(500).json({ error: '生成日报时发生错误' });
  }
});

// 新增：获取多天日期范围的新闻并按日期分类
app.post('/api/multi-date-reports', async (req, res) => {
  try {
    const startDate = req.body.startDate; // 格式应为 YYYY-MM-DD
    const endDate = req.body.endDate; // 格式应为 YYYY-MM-DD
    
    if (!startDate || !startDate.match(/^\d{4}-\d{2}-\d{2}$/) || 
        !endDate || !endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({ error: '日期格式不正确，应为YYYY-MM-DD' });
    }
    
    logInfo(`收到获取${startDate}至${endDate}期间的新闻请求`);
    
    // 获取所有新闻
    const newsItems = await fetchNewsFromRSS();
    
    // 按照日期范围筛选
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // 设置为当天结束时间
    
    logInfo(`筛选${start.toISOString()}至${end.toISOString()}期间的新闻`);
    
    const filteredNews = newsItems.filter(item => {
      const itemDate = new Date(item.pubDate);
      return itemDate >= start && itemDate <= end;
    });
    
    logInfo(`日期范围内共获取到${filteredNews.length}条新闻`);
    
    // 按发布日期分组
    const newsByDate = {};
    
    filteredNews.forEach(item => {
      const itemDate = new Date(item.pubDate);
      const dateStr = itemDate.toISOString().split('T')[0]; // YYYY-MM-DD格式
      
      if (!newsByDate[dateStr]) {
        newsByDate[dateStr] = {
          date: dateStr,
          chineseDate: `${itemDate.getMonth() + 1}月${itemDate.getDate()}日`,
          news: []
        };
      }
      
      newsByDate[dateStr].news.push(item);
    });
    
    // 处理每个日期分组中的新闻（简化版，不进行AI摘要和关键词提取）
    const result = Object.values(newsByDate).map(dateGroup => {
      // 按来源分组
      const newsBySource = {};
      dateGroup.news.forEach(item => {
        const sourceName = item.source_name || '未知来源';
        if (!newsBySource[sourceName]) {
          newsBySource[sourceName] = [];
        }
        newsBySource[sourceName].push(item);
      });
      
      // 添加来源分组信息
      dateGroup.sourceGroups = Object.entries(newsBySource).map(([sourceName, items]) => ({
        sourceName,
        count: items.length,
        items: items.map((item, index) => ({
          id: `${dateGroup.date}-${sourceName}-${index}`,
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          source_name: sourceName
        }))
      }));
      
      // 添加新闻总数
      dateGroup.newsCount = dateGroup.news.length;
      
      // 移除原始news数组，减少响应大小
      delete dateGroup.news;
      
      return dateGroup;
    }).sort((a, b) => new Date(b.date) - new Date(a.date)); // 按日期降序排序
    
    res.json(result);
  } catch (error) {
    logError(`获取${req.body.startDate}至${req.body.endDate}期间的新闻时出错:`, error);
    res.status(500).json({ error: '获取多日期新闻时发生错误' });
  }
});

// 提供多日期报告页面
app.get('/date-range-reports', (req, res) => {
  const startDate = req.query.start || new Date().toISOString().split('T')[0];
  const endDate = req.query.end || new Date().toISOString().split('T')[0];
  
  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>华泰证券AI日报</title>
    <style>
      body {
        font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
        margin: 0;
        padding: 20px;
        background-color: #f5f5f5;
      }
      .container {
        max-width: 1000px;
        margin: 0 auto;
        background-color: #fff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      }
      h1 {
        text-align: center;
        color: #333;
        margin-bottom: 30px;
      }
      .date-selector {
        display: flex;
        justify-content: center;
        gap: 15px;
        margin-bottom: 20px;
      }
      .date-selector input, .date-selector button {
        padding: 8px 15px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      .date-selector button {
        background-color: #e84118;
        color: white;
        border: none;
        cursor: pointer;
      }
      .date-container {
        margin-bottom: 30px;
        border: 1px solid #eee;
        border-radius: 8px;
        overflow: hidden;
        width: 100%;
      }
      .date-header {
        background-color: #f9f1f0;
        padding: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #eee;
      }
      .date-title {
        font-size: 1.5em;
        font-weight: bold;
        color: #e84118;
        margin: 0;
      }
      .source-group {
        padding: 15px;
        border-bottom: 1px solid #eee;
      }
      .source-title {
        font-weight: bold;
        color: #555;
        margin-bottom: 10px;
      }
      .news-list {
        list-style-type: none;
        padding-left: 0;
      }
      .news-item {
        padding: 10px 0;
        border-bottom: 1px solid #f0f0f0;
      }
      .news-item:last-child {
        border-bottom: none;
      }
      .news-link {
        color: #333;
        text-decoration: none;
      }
      .news-link:hover {
        color: #e84118;
        text-decoration: underline;
      }
      .pubdate {
        font-size: 0.85em;
        color: #777;
        margin-top: 5px;
      }
      .loading {
        text-align: center;
        padding: 30px;
        font-size: 1.2em;
        color: #666;
      }
      .error {
        color: #d32f2f;
        text-align: center;
        padding: 20px;
      }
      .no-data {
        text-align: center;
        padding: 30px;
        color: #666;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>华泰证券AI日报</h1>
      <div class="date-selector">
        <input type="date" id="start-date" value="${startDate}">
        <span>至</span>
        <input type="date" id="end-date" value="${endDate}">
        <button id="fetch-btn">获取多日报告</button>
      </div>
      <div id="reports-container">
        <div class="loading">加载中...</div>
      </div>
    </div>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('reports-container');
        const startInput = document.getElementById('start-date');
        const endInput = document.getElementById('end-date');
        const fetchBtn = document.getElementById('fetch-btn');
        
        // 初始加载
        fetchReports();
        
        // 按钮点击事件
        fetchBtn.addEventListener('click', fetchReports);
        
        function fetchReports() {
          const startDate = startInput.value;
          const endDate = endInput.value;
          
          // 验证日期
          if (!startDate || !endDate) {
            container.innerHTML = '<div class="error">请选择开始和结束日期</div>';
            return;
          }
          
          if (new Date(startDate) > new Date(endDate)) {
            container.innerHTML = '<div class="error">开始日期不能晚于结束日期</div>';
            return;
          }
          
          // 显示加载中
          container.innerHTML = '<div class="loading">加载中...</div>';
          
          // 发送请求获取数据
          fetch('/api/multi-date-reports', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ startDate, endDate })
          })
          .then(response => {
            if (!response.ok) {
              throw new Error('网络响应不正常');
            }
            return response.json();
          })
          .then(data => {
            if (data.length === 0) {
              container.innerHTML = '<div class="no-data">所选日期范围内没有数据</div>';
              return;
            }
            
            // 渲染数据
            renderReports(data);
          })
          .catch(error => {
            console.error('获取数据失败:', error);
            container.innerHTML = \`<div class="error">获取数据失败: \${error.message}</div>\`;
          });
        }
        
        function renderReports(reports) {
          // 对报告按日期进行去重处理，避免重复显示
          const uniqueReports = [];
          const dateSet = new Set();
          
          reports.forEach(report => {
            if (!dateSet.has(report.date)) {
              dateSet.add(report.date);
              uniqueReports.push(report);
            }
          });
          
          let html = '';
          
          uniqueReports.forEach(report => {
            // 日期标题
            html += \`
              <div class="date-container">
                <div class="date-header">
                  <h2 class="date-title">\${report.chineseDate} 华泰证券AI日报</h2>
                  <span>共\${report.newsCount}条新闻</span>
                </div>
            \`;
            
            // 按来源分组显示新闻
            if (report.sourceGroups && report.sourceGroups.length > 0) {
              report.sourceGroups.forEach(group => {
                html += \`
                  <div class="source-group">
                    <div class="source-title">\${group.sourceName} (\${group.count}条)</div>
                    <ul class="news-list">
                \`;
                
                // 每个来源的新闻项目
                group.items.forEach(item => {
        const pubDate = new Date(item.pubDate);
                  const formattedTime = pubDate.toLocaleTimeString('zh-CN', { 
                    hour: '2-digit', 
                    minute: '2-digit'
                  });
                  
                  html += \`
                    <li class="news-item">
                      <a href="\${item.link}" target="_blank" class="news-link">\${item.title}</a>
                      <div class="pubdate">发布时间: \${formattedTime}</div>
                    </li>
                  \`;
                });
                
                html += \`
                    </ul>
                  </div>
                \`;
              });
    } else {
              html += '<div class="no-data">该日期没有新闻数据</div>';
            }
            
            html += '</div>'; // 关闭date-container
          });
          
          container.innerHTML = html;
        }
      });
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// 设置每天上午9点更新日报，晚上23:59归档
cron.schedule('0 9 * * *', async () => {
  logInfo('计划任务: 开始生成每日日报');
  try {
    // 先尝试归档昨天的报告
    archiveCurrentReport();
    // 然后生成今天的新报告
    await generateDailyReport();
    logInfo('计划任务: 成功完成每日日报生成');
  } catch (error) {
    logError('计划任务: 日报生成失败:', error);
  }
});

cron.schedule('59 23 * * *', () => {
  logInfo('计划任务: 开始归档当前日报');
  archiveCurrentReport();
});

// 启动应用
app.listen(PORT, () => {
  logInfo(`服务器已启动，运行在端口 ${PORT}`);
  logInfo(`RSS源配置: ${RSS_SOURCES.map(s => s.name).join(', ')}`);
});

// 添加未捕获异常处理，防止程序崩溃
process.on('uncaughtException', (err) => {
  logError('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('未处理的Promise拒绝:', reason);
});

// 新增：重写特定日期新闻内容
app.post('/api/rewrite-news-content', async (req, res) => {
  try {
    const targetDate = req.body.date; // 格式应为 YYYY-MM-DD
    
    if (!targetDate || !targetDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({ error: '日期格式不正确，应为YYYY-MM-DD' });
    }
    
    logInfo(`收到重写${targetDate}新闻内容的请求`);
    
    // 检查是否为当前日报
    const isCurrentReport = fs.existsSync(CURRENT_REPORT_PATH) && 
      JSON.parse(fs.readFileSync(CURRENT_REPORT_PATH, 'utf8')).date === targetDate;
    
    let reportPath;
    let report;
    
    if (isCurrentReport) {
      reportPath = CURRENT_REPORT_PATH;
      report = JSON.parse(fs.readFileSync(CURRENT_REPORT_PATH, 'utf8'));
      logInfo(`正在重写当前日报(${targetDate})的内容`);
    } else {
      // 检查归档中是否有该日期的报告
      const archiveFilePath = path.join(ARCHIVE_DIR, `report-${targetDate}.json`);
      if (!fs.existsSync(archiveFilePath)) {
        return res.status(404).json({ error: `未找到${targetDate}的日报` });
      }
      reportPath = archiveFilePath;
      report = JSON.parse(fs.readFileSync(archiveFilePath, 'utf8'));
      logInfo(`正在重写归档日报(${targetDate})的内容`);
    }
    
    // 对每条新闻重写内容
    const rewritePromises = report.news.map(async (newsItem, index) => {
      // 提取不含编号的原始标题
      let originalTitle = newsItem.title;
      if (originalTitle.includes('、')) {
        originalTitle = originalTitle.split('、')[1]; // 获取编号后的完整标题
      }
      
      logInfo(`开始重写第${index + 1}条新闻: ${originalTitle.substring(0, 30)}...`);
      
      try {
        // 使用豆包API重写内容
          const response = await openai.chat.completions.create({
            model: "doubao-1-5-pro-32k-250115",
            messages: [
              {
                role: "system",
              content: "你是一个专业的新闻内容优化专家。你需要将新闻内容改写为约200字的简洁概述，只保留核心信息，删除所有不必要的内容。不要提及任何图片、媒体来源、记者名称等无关信息。不要使用'图片'、'报道'等词语。使用客观、专业的语言风格，重点关注：1)核心事件或技术突破；2)相关组织或研究机构；3)关键数据或结果；4)影响或意义。"
              },
              {
                role: "user",
              content: `请将以下新闻内容改写为约200字的简洁概述，只保留核心信息:\n\n标题：${originalTitle}\n\n原始内容：${newsItem.content}`
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        });
        
        // 获取生成的内容
        let newContent = response.choices[0].message.content.trim();
        
        // 确保内容长度在180-220字之间
        if (newContent.length > 220) {
          // 尝试在句子结束处截断
          let cutPosition = 220;
          const lastPeriod = newContent.lastIndexOf('。', 220);
          const lastQuestion = newContent.lastIndexOf('？', 220);
          const lastExclamation = newContent.lastIndexOf('！', 220);
          
          // 找到最靠近220字的句子结束位置
          cutPosition = Math.max(lastPeriod, lastQuestion, lastExclamation);
          
          if (cutPosition > 180) {
            newContent = newContent.substring(0, cutPosition + 1);
          }
        }
        
        // 进行最终清理，确保没有"图片"等文字
        newContent = newContent.replace(/图片[：:]/g, '');
        newContent = newContent.replace(/\[图片\]/g, '');
        newContent = newContent.replace(/图\d+/g, '');
        newContent = newContent.replace(/据.*?报道/g, '');
        newContent = newContent.replace(/来源[：:].+?。/g, '。');
        
        logInfo(`第${index + 1}条新闻内容重写完成，新内容长度: ${newContent.length}字`);
        
        // 更新新闻内容，保留原始完整标题
        return {
          ...newsItem,
          content: newContent,
          contentLengthSufficient: newContent.length >= 180 // 确保内容长度足够
        };
        } catch (error) {
        logError(`重写第${index + 1}条新闻内容时出错:`, error);
        // 如果失败，保留原内容
        return newsItem;
      }
    });
    
    // 等待所有重写操作完成
    const updatedNews = await Promise.all(rewritePromises);
    
    // 更新报告中的新闻
    report.news = updatedNews;
    
    // 保存更新后的报告
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    logInfo(`成功重写${targetDate}日报的${updatedNews.length}条新闻内容`);
    
    // 如果是归档日报，还需要更新current-report.json
    if (!isCurrentReport) {
      fs.writeFileSync(CURRENT_REPORT_PATH, JSON.stringify(report, null, 2));
      logInfo(`已将重写后的${targetDate}日报设置为当前日报`);
    }
    
    res.json({ 
      success: true, 
      message: `成功重写${targetDate}日报的${updatedNews.length}条新闻内容`,
      date: targetDate
    });
  } catch (error) {
    logError(`重写${req.body.date}日报内容时出错:`, error);
    res.status(500).json({ error: '重写日报内容时发生错误' });
  }
});
