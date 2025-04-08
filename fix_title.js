const fs = require('fs');
console.log('正在修复标题问题...');
// 读取服务器文件内容
const serverCode = fs.readFileSync('server.js', 'utf8');
// 替换有问题的标题处理代码
const oldCode = 'if (titleContent.includes(\'、\')) {
        const titleParts = titleContent.split(\'、\');
        if (titleParts.length > 1) {
          titleContent = titleParts[1]; // 只获取编号后的内容部分
        }
      }';
const newCode = '      // 使用正则表达式匹配开头的数字+、格式（确保只匹配标题开头的编号）
      if (/^\d+、/.test(titleContent)) {
        // 如果标题已经有编号格式（如"1、标题内容"），则只保留标题内容部分
        titleContent = titleContent.replace(/^\d+、/, "");
      }';
// 执行替换
const updatedServerCode = serverCode.replace(oldCode, newCode);
// 保存修改后的文件
fs.writeFileSync('server.js', updatedServerCode, 'utf8');
console.log('标题处理代码已成功更新!');
