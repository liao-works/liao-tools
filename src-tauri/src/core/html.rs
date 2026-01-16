use scraper::{Html, Selector};
use anyhow::Result;

/// 通用 HTML 解析工具

pub struct HtmlParser;

impl HtmlParser {
    /// 解析 HTML 文档
    pub fn parse(html: &str) -> Html {
        Html::parse_document(html)
    }

    /// 创建选择器（带错误处理）
    pub fn selector(pattern: &str) -> Result<Selector> {
        Selector::parse(pattern)
            .map_err(|e| anyhow::anyhow!("Invalid CSS selector '{}': {:?}", pattern, e))
    }

    /// 提取表格数据为二维数组
    pub fn extract_table_rows(html: &Html, table_selector: &str) -> Result<Vec<Vec<String>>> {
        let table_sel = Self::selector(table_selector)?;
        let row_sel = Self::selector("tr")?;
        let cell_sel = Self::selector("td")?;

        let mut rows = Vec::new();
        
        if let Some(table) = html.select(&table_sel).next() {
            for row in table.select(&row_sel) {
                let cells: Vec<String> = row
                    .select(&cell_sel)
                    .map(|cell| {
                        cell.text()
                            .collect::<Vec<_>>()
                            .join("")
                            .trim()
                            .to_string()
                    })
                    .collect();
                
                if !cells.is_empty() {
                    rows.push(cells);
                }
            }
        }

        Ok(rows)
    }

    /// 清理文本（去除多余空格、换行等）
    pub fn clean_text(text: &str) -> String {
        text.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// 提取数字（从文本中提取纯数字）
    pub fn extract_digits(text: &str) -> String {
        text.chars()
            .filter(|c| c.is_ascii_digit())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text() {
        let text = "  Hello   World  \n\n  Test  ";
        assert_eq!(HtmlParser::clean_text(text), "Hello World Test");
    }

    #[test]
    fn test_extract_digits() {
        let text = "HS Code: 1234-5678-90";
        assert_eq!(HtmlParser::extract_digits(text), "1234567890");
    }
}
