import { describe, expect, it } from 'vitest';
import {
  countLines, extractNumberStats, mergeDimensionsCbm, normalizeNumbers,
  optimizeFormat, splitElements, toLowerCase, toTitleCase, toUpperCase, verticalizeTabbed,
} from './transforms';

describe('optimizeFormat 优化格式', () => {
  it('把换行替换为指定分隔符', () => {
    expect(optimizeFormat('a\nb\nc', '-')).toBe('a-b-c');
  });

  it('分隔符为空时合并为一行', () => {
    expect(optimizeFormat('a\nb\nc', '')).toBe('abc');
  });

  it('分隔符可以是空格等任意字符', () => {
    expect(optimizeFormat('a\nb', ', ')).toBe('a, b');
  });

  it('去除整段首尾空白', () => {
    expect(optimizeFormat('  a\nb\n  ', '-')).toBe('a-b');
  });

  it('无换行文本原样返回（仅去首尾空白）', () => {
    expect(optimizeFormat('  abc  ', '-')).toBe('abc');
  });
});

describe('splitElements 分割元素', () => {
  it('把 key<TAB>value 整理为 key: value', () => {
    expect(splitElements('名称\tx1200')).toBe('名称: x1200');
  });

  it('key 中的星号被移除', () => {
    expect(splitElements('*重量*\t2kg')).toBe('重量: 2kg');
  });

  it('跳过不含 Tab 的行', () => {
    expect(splitElements('a\t1\n没有tab\nb\t2')).toBe('a: 1\nb: 2');
  });

  it('key 或 value 为空的行跳过', () => {
    expect(splitElements('\tv\nk\t\n\t\n')).toBe('');
  });

  it('key 与 value 首尾空白被去除', () => {
    expect(splitElements('  key \t value  ')).toBe('key: value');
  });

  it('只在第一个 Tab 处分割，value 可含 Tab', () => {
    expect(splitElements('k\ta\tb')).toBe('k: a\tb');
  });

  it('多行逐行处理并换行连接', () => {
    expect(splitElements('品名\t杯子\n数量\t24')).toBe('品名: 杯子\n数量: 24');
  });

  it('连续空格分隔同样识别（网页 / PDF 复制场景）', () => {
    expect(splitElements('收件邮编*   07007\n收件人姓名*  chaomei chen')).toBe(
      '收件邮编: 07007\n收件人姓名: chaomei chen',
    );
  });

  it('单空格分隔可兜底识别', () => {
    expect(splitElements('国家代码* ES')).toBe('国家代码: ES');
  });

  it('Tab 优先于空格，值内部空格原样保留', () => {
    expect(splitElements('a\t  b  c')).toBe('a: b  c');
  });

  it('真实场景回归：空格分隔的收件信息块（原版仅支持 Tab 时整块失效）', () => {
    const input = [
      '收件人姓名*      chaomei chen',
      '收件人电话*      695212461',
      '收件人洲省*',
      '收件城市*',
      '收件地址*      C/DEL CAMP DE EU 3 LLEVANT 07007 PALMA   ILLES BALE SRS',
      '收件邮编*      07007',
      '收件邮箱      460619588@qq.com',
      '国家代码*      ES',
    ].join('\n');
    expect(splitElements(input)).toBe(
      [
        '收件人姓名: chaomei chen',
        '收件人电话: 695212461',
        '收件地址: C/DEL CAMP DE EU 3 LLEVANT 07007 PALMA   ILLES BALE SRS',
        '收件邮编: 07007',
        '收件邮箱: 460619588@qq.com',
        '国家代码: ES',
      ].join('\n'),
    );
  });
});

describe('verticalizeTabbed Tab 竖排', () => {
  it('按 Tab 拆分并竖排', () => {
    expect(verticalizeTabbed('a\tb\tc')).toBe('a\nb\nc');
  });

  it('滤掉空字段', () => {
    expect(verticalizeTabbed('a\t\tb')).toBe('a\nb');
  });

  it('不含 Tab 的行原样保留', () => {
    expect(verticalizeTabbed('x\ty\n普通行\nz\tw')).toBe('x\ny\n普通行\nz\nw');
  });

  it('字段首尾空白去除', () => {
    expect(verticalizeTabbed(' a \t b ')).toBe('a\nb');
  });

  it('连续空格分隔同样竖排', () => {
    expect(verticalizeTabbed('a  b  c\n纯文本')).toBe('a\nb\nc\n纯文本');
  });
});

describe('mergeDimensionsCbm 尺寸合并 CBM', () => {
  it('空格分隔字段用 * 连接并追加 CBM', () => {
    expect(mergeDimensionsCbm('0.5 0.3 0.2')).toBe('0.5*0.3*0.2CBM');
  });

  it('小数尾零被规整', () => {
    expect(mergeDimensionsCbm('0.50 2.0')).toBe('0.5*2CBM');
  });

  it('整数尾部零不误删', () => {
    expect(mergeDimensionsCbm('100.0')).toBe('100CBM');
  });

  it('不含小数点的字段保持原样', () => {
    expect(mergeDimensionsCbm('60 50 40 CM')).toBe('60*50*40*CMCBM');
  });

  it('多行逐行处理，空行输出空行', () => {
    expect(mergeDimensionsCbm('1 2\n\n3 4')).toBe('1*2CBM\n\n3*4CBM');
  });
});

describe('normalizeNumbers 数字规整', () => {
  it('同尺寸合并但不追加 CBM', () => {
    expect(normalizeNumbers('0.50 0.30 0.20')).toBe('0.5*0.3*0.2');
  });

  it('整数尾部零不误删（回归：100.0 曾被规整成 1）', () => {
    expect(normalizeNumbers('100.0 0.10 abc')).toBe('100*0.1*abc');
  });

  it('无法解析为数字的含点字段原样保留', () => {
    expect(normalizeNumbers('a.b . c2.5')).toBe('a.b*.*c2.5');
  });

  it('纯整数与文本字段原样保留', () => {
    expect(normalizeNumbers('60 50 abc')).toBe('60*50*abc');
  });
});

describe('toTitleCase 标题格式', () => {
  it('每个单词首字母大写', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
  });

  it('其余字母转小写', () => {
    expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
  });

  it('中文不受影响', () => {
    expect(toTitleCase('中国 hello')).toBe('中国 Hello');
  });

  it('撇号后的字母大写（与 Python str.title 一致）', () => {
    expect(toTitleCase("it's ok")).toBe("It'S Ok");
  });

  it('数字后的字母大写（与 Python str.title 一致）', () => {
    expect(toTitleCase('2nd place')).toBe('2Nd Place');
  });

  it('去除整段首尾空白', () => {
    expect(toTitleCase('  abc def  ')).toBe('Abc Def');
  });
});

describe('toUpperCase / toLowerCase', () => {
  it('转大写', () => {
    expect(toUpperCase('aBc 123')).toBe('ABC 123');
  });

  it('转小写', () => {
    expect(toLowerCase('aBc 123')).toBe('abc 123');
  });

  it('去除整段首尾空白', () => {
    expect(toUpperCase('  ab  ')).toBe('AB');
  });
});

describe('extractNumberStats 数字统计', () => {
  it('空文本返回零值', () => {
    expect(extractNumberStats('')).toEqual({ count: 0, sum: 0, average: null });
  });

  it('从混合文本中提取数字', () => {
    const stats = extractNumberStats('0.5*0.3*0.2CBM');
    expect(stats.count).toBe(3);
    expect(stats.sum).toBeCloseTo(1, 10);
    expect(stats.average).toBeCloseTo(1 / 3, 10);
  });

  it('整数与小数混合求和', () => {
    const stats = extractNumberStats('a1 b2.5 c10');
    expect(stats.count).toBe(3);
    expect(stats.sum).toBeCloseTo(13.5, 10);
    expect(stats.average).toBeCloseTo(4.5, 10);
  });

  it('负号不参与匹配（与原程序正则一致）', () => {
    expect(extractNumberStats('-3')).toEqual({ count: 1, sum: 3, average: 3 });
  });
});

describe('countLines 行数统计', () => {
  it('空文本为 0', () => {
    expect(countLines('')).toBe(0);
  });

  it('单行为 1', () => {
    expect(countLines('a')).toBe(1);
  });

  it('多行按换行计数', () => {
    expect(countLines('a\nb\nc')).toBe(3);
  });
});
