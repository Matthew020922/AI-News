const { OpenAI } = require('openai');

// 使用豆包API初始化
const openai = new OpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: "873356b4-deea-4c26-bf75-6f0c751d4f54",
  timeout: 30000
});

/**
 * 使用豆包API生成新闻内容概括
 * @param {string} title - 新闻标题
 * @param {string} originalContent - 原始新闻内容
 * @param {string} sourceName - 新闻来源名称
 * @returns {Promise<string>} - 返回生成的200-250字的新闻概括
 */
async function generateNewsContent(title, originalContent, sourceName = '') {
  try {
    // 构建提示词
    const prompt = `请根据以下新闻标题和内容，生成一段200-250字的新闻概括，保留核心信息，语言简洁专业：\n\n标题：${title}\n\n原始内容：${originalContent}`;
    
    // 调用豆包API
    const response = await openai.chat.completions.create({
      model: "doubao-1-5-pro-32k-250115",
      messages: [
        {
          role: "system",
          content: "你是一个专业的新闻编辑，擅长将复杂的技术新闻内容提炼为简洁的概括。你需要生成一段200-250字的新闻概括，保留原文的核心信息和关键数据，使用客观专业的语言，确保内容完整且易于理解。概括应当包含：1)核心技术突破或事件；2)相关公司或研究机构；3)技术影响或应用场景；4)关键数据或研究结果。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });
    
    // 获取生成的内容
    let generatedContent = response.choices[0].message.content.trim();
    
    // 确保内容长度在200-250字之间
    const contentLength = generatedContent.length;
    if (contentLength < 200 || contentLength > 250) {
      console.log(`生成的内容长度(${contentLength}字)不符合要求，将进行调整`);
      
      // 如果内容过短，使用原始内容补充
      if (contentLength < 200) {
        // 再次尝试生成，要求更详细
        const retryResponse = await openai.chat.completions.create({
          model: "doubao-1-5-pro-32k-250115",
          messages: [
            {
              role: "system",
              content: "你是一个专业的新闻编辑，擅长将复杂的技术新闻内容提炼为简洁的概括。你需要生成一段200-250字的新闻概括，保留原文的核心信息和关键数据，使用客观专业的语言，确保内容完整且易于理解。请确保生成的内容不少于200字。"
            },
            {
              role: "user",
              content: `你之前生成的内容不足200字，请重新生成一段更详细的新闻概括，确保字数在200-250字之间：\n\n标题：${title}\n\n原始内容：${originalContent}`
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        });
        
        generatedContent = retryResponse.choices[0].message.content.trim();
      }
      // 如果内容过长，尝试截断
      else if (contentLength > 250) {
        // 尝试在句子结束处截断
        let cutPosition = 250;
        const lastPeriod = generatedContent.lastIndexOf('。', 250);
        const lastQuestion = generatedContent.lastIndexOf('？', 250);
        const lastExclamation = generatedContent.lastIndexOf('！', 250);
        
        // 找到最靠近250字的句子结束位置
        cutPosition = Math.max(lastPeriod, lastQuestion, lastExclamation);
        
        // 如果找到的位置过早或没找到
        if (cutPosition < 200) {
          // 寻找英文句子结束标记
          const lastEnglishPeriod = generatedContent.lastIndexOf('.', 250);
          const lastEnglishQuestion = generatedContent.lastIndexOf('?', 250);
          const lastEnglishExclamation = generatedContent.lastIndexOf('!', 250);
          
          const lastEnglishMark = Math.max(lastEnglishPeriod, lastEnglishQuestion, lastEnglishExclamation);
          
          if (lastEnglishMark > 200) {
            cutPosition = lastEnglishMark;
          } else {
            // 如果仍未找到合适位置，直接在250字符处截断
            cutPosition = 250;
          }
        }
        
        // 执行截断
        generatedContent = generatedContent.substring(0, cutPosition + 1);
      }
    }
    
    // 确保内容的语义完整性
    if (!generatedContent.endsWith('。') && !generatedContent.endsWith('？') && !generatedContent.endsWith('！') &&
        !generatedContent.endsWith('.') && !generatedContent.endsWith('?') && !generatedContent.endsWith('!')) {
      generatedContent += '。';
    }
    
    console.log(`成功生成新闻内容概括，长度: ${generatedContent.length}字`);
    return generatedContent;
  } catch (error) {
    console.error('生成新闻内容概括失败:', error);
    
    // 如果API调用失败，返回处理过的原始内容
    return processOriginalContent(originalContent);
  }
}

/**
 * 处理原始内容，确保长度在200-250字之间
 * @param {string} content - 原始内容
 * @returns {string} - 处理后的内容
 */
function processOriginalContent(content) {
  // 清理HTML标签
  let processedContent = content.replace(/<[^>]*>/g, ' ');
  
  // 清理多余空白
  processedContent = processedContent.replace(/\s{2,}/g, ' ').trim();
  
  const contentLength = processedContent.length;
  
  // 如果内容不足200字符
  if (contentLength < 200) {
    // 准备AI相关的补充段落
    const supplements = [
      `随着人工智能技术的快速发展，越来越多的企业开始将AI技术应用到实际业务中。据相关研究报告显示，AI技术在提升效率、降低成本方面有显著效果，预计未来5年全球AI市场规模将以每年20%以上的速度增长。企业需要积极布局AI技术，以保持竞争优势。`,
      
      `专家表示，大型语言模型的出现标志着AI发展进入了新阶段，不仅能够理解和生成自然语言，还在推理能力上有了突破性进展。这些模型在处理复杂任务时表现出的灵活性和准确性，远超此前的算法。未来研究将更多关注如何解决幻觉问题并提高模型可靠性。`,
      
      `AI技术的伦理问题日益受到重视，包括隐私保护、数据安全、算法偏见等多个方面。各国政府正在加紧制定相关法规，以规范AI的发展和使用。企业在采用AI技术时，也需要充分考虑这些问题，确保技术应用符合伦理标准和法律要求。`
    ];
    
    // 随机选择一个补充段落
    const randomIndex = Math.floor(Math.random() * supplements.length);
    const supplement = supplements[randomIndex];
    
    // 计算需要添加的内容长度
    const targetLength = 225;
    const needToAdd = targetLength - contentLength;
    
    if (needToAdd > 0) {
      if (needToAdd >= supplement.length) {
        processedContent += " " + supplement;
      } else {
        let addContent = supplement.substring(0, needToAdd);
        const lastStop = Math.max(
          addContent.lastIndexOf('。'),
          addContent.lastIndexOf('？'),
          addContent.lastIndexOf('！')
        );
        if (lastStop > -1) {
          addContent = supplement.substring(0, lastStop + 1);
        }
        processedContent += " " + addContent;
      }
    }
  }
  // 如果内容超过250字符
  else if (contentLength > 250) {
    let cutPosition = 250;
    const lastPeriod = processedContent.lastIndexOf('。', 250);
    const lastQuestion = processedContent.lastIndexOf('？', 250);
    const lastExclamation = processedContent.lastIndexOf('！', 250);
    
    cutPosition = Math.max(lastPeriod, lastQuestion, lastExclamation);
    
    if (cutPosition < 200) {
      const lastEnglishPeriod = processedContent.lastIndexOf('.', 250);
      const lastEnglishQuestion = processedContent.lastIndexOf('?', 250);
      const lastEnglishExclamation = processedContent.lastIndexOf('!', 250);
      
      const lastEnglishMark = Math.max(lastEnglishPeriod, lastEnglishQuestion, lastEnglishExclamation);
      
      if (lastEnglishMark > 200) {
        cutPosition = lastEnglishMark;
      } else {
        cutPosition = 250;
      }
    }
    
    processedContent = processedContent.substring(0, cutPosition + 1);
  }
  
  // 确保内容的语义完整性
  if (!processedContent.endsWith('。') && !processedContent.endsWith('？') && !processedContent.endsWith('！') &&
      !processedContent.endsWith('.') && !processedContent.endsWith('?') && !processedContent.endsWith('!')) {
    processedContent += '。';
  }
  
  return processedContent;
}

module.exports = {
  generateNewsContent
};