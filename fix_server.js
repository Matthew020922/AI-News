// 修复处理标题的代码
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// 定位有问题的代码块
const pattern = /if \(titleContent\.includes\('、'\)\) \{
\s+const titleParts = titleContent\.split\('、'\);
\s+if \(titleParts\.length > 1\) \{
\s+titleContent = titleParts\[1\]; \/\/ 只获取编号后的内容部分
\s+\}
\s+\}/;

// 准备替换代码
const replacement = '// 使用正则表达式匹配开头的数字+、格式（确保只匹配标题开头的编号）
      if (/^\d+、/.test(titleContent)) {
        // 如果标题已经有编号格式（如"1、标题内容"），则只保留标题内容部分
        titleContent = titleContent.replace(/^\d+、/, "");
      }';

// 执行替换
content = content.replace(pattern, replacement);

// 写回文件
fs.writeFileSync('server.js', content, 'utf8');

console.log('成功修复server.js中的标题处理逻辑');
