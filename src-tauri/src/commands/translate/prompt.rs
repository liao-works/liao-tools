use crate::models::translate::{TranslateMode, TonePreset, TranslateRequest};

/// 通用输出规则（翻译/润色共用）
const BASE_RULES: &str = "输出要求：完整保留原文格式（称呼、换行、空行、列表、签名）。人名、公司名、产品名有通用译名则使用通用译名，否则保留原文。只输出结果本身，不要任何解释、前言或后缀。";

/// 目标语言的提示词名称（提示词用中文名，模型可稳定理解）
fn language_display(code: &str) -> &str {
    match code {
        "zh" => "简体中文",
        "en" => "英语",
        "ja" => "日语",
        "ko" => "韩语",
        "de" => "德语",
        "fr" => "法语",
        "es" => "西班牙语",
        "ru" => "俄语",
        other => other,
    }
}

fn tone_section(tone: TonePreset) -> &'static str {
    match tone {
        TonePreset::Natural => "语气要求：自然商务。清晰、礼貌、直接，像一位友善且经验丰富的职业人士的日常商务邮件。避免陈旧套话和堆砌敬语（例如 \"I hope this email finds you well\" 之类的开头可以酌情简化），使用现代、自然的商务表达。",
        TonePreset::Casual => "语气要求：轻松随和。像和熟识的同事或朋友写消息，可以使用口语化表达和缩略语，语气放松但不失分寸，不要公文化。",
        TonePreset::Formal => "语气要求：严谨正式。适用于正式函件、合同沟通、对外投诉等场景：措辞严谨完整，遵循正式书信惯例，但保持可读，不生硬古板。",
    }
}

pub fn build_system_prompt(
    mode: TranslateMode,
    tone: Option<TonePreset>,
    custom_note: Option<&str>,
) -> String {
    let mut sections: Vec<String> = Vec::new();
    match mode {
        TranslateMode::Translate => {
            sections.push("你是商务沟通翻译助手，把用户输入翻译成目标语言。译文要像目标语言的母语者自然写出来的，而不是逐词对译。".into());
            if let Some(tone) = tone {
                sections.push(tone_section(tone).into());
            }
            if let Some(note) = trimmed(custom_note) {
                sections.push(format!("额外要求：{note}"));
            }
            sections.push(BASE_RULES.into());
        }
        TranslateMode::Polish => {
            sections.push("你是文字润色助手。改写用户输入，保持原语言不变：修正语法错误和不地道的表达，使文本更自然、流畅、专业。保留原意和全部信息，不增删内容。".into());
            if let Some(tone) = tone {
                sections.push(tone_section(tone).into());
            }
            if let Some(note) = trimmed(custom_note) {
                sections.push(format!("额外要求：{note}"));
            }
            sections.push(BASE_RULES.into());
        }
        TranslateMode::Explain => {
            sections.push(
                "你是商务沟通解读助手。用户会给你一封邮件或一段对话，用简体中文输出以下三部分，使用 Markdown 格式、加粗小标题：\n\n\
                 **整体语气与意图**：分析对方真实的立场和情绪——是在催促、客气拒绝、例行通知，还是暗示不满，以及希望读者做什么。\n\n\
                 **关键表达解析**：逐条列出值得注意的表达（习语、委婉语、商务套话），解释字面意思与真实含义或潜台词；没有值得解析的表达时写「无明显特殊表达」。\n\n\
                 **备选译法**：挑 1-2 个关键句，给出忠实译法与更地道译法的对比。\n\n\
                 客观中立，不要过度揣测。"
                    .into(),
            );
        }
    }
    sections.join("\n\n")
}

pub fn build_user_prompt(request: &TranslateRequest) -> String {
    match request.mode {
        TranslateMode::Translate => format!(
            "翻译成{}：\n\n{}",
            language_display(&request.target_lang),
            request.text
        ),
        TranslateMode::Polish => format!("润色以下文本：\n\n{}", request.text),
        TranslateMode::Explain => format!("解读以下内容：\n\n{}", request.text),
    }
}

fn trimmed(note: Option<&str>) -> Option<&str> {
    note.map(str::trim).filter(|n| !n.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::translate::{TranslateMode, TonePreset};

    #[test]
    fn translate_prompt_contains_tone_and_rules() {
        let p = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), None);
        assert!(p.contains("翻译"));
        assert!(p.contains("自然商务"));
        assert!(p.contains("不是逐词对译"));
        assert!(p.contains("只输出"));
    }

    #[test]
    fn all_tones_render_distinct_sections() {
        let natural = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), None);
        let casual = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Casual), None);
        let formal = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Formal), None);
        assert!(casual.contains("轻松随和"));
        assert!(formal.contains("严谨正式"));
        assert!(natural.contains("自然商务"));
        assert_ne!(natural, casual);
        assert_ne!(casual, formal);
    }

    #[test]
    fn custom_note_is_appended() {
        let p = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), Some("对方是老客户"));
        assert!(p.contains("额外要求"));
        assert!(p.contains("对方是老客户"));
        // 空白注释不追加
        let p2 = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), Some("   "));
        assert!(!p2.contains("额外要求"));
    }

    #[test]
    fn polish_keeps_language_and_explain_is_structured() {
        let polish = build_system_prompt(TranslateMode::Polish, Some(TonePreset::Casual), None);
        assert!(polish.contains("保持原语言"));
        let explain = build_system_prompt(TranslateMode::Explain, None, None);
        assert!(explain.contains("整体语气与意图"));
        assert!(explain.contains("关键表达解析"));
        assert!(explain.contains("备选译法"));
        // explain 忽略语气
        assert!(!explain.contains("语气要求"));
    }

    #[test]
    fn user_prompt_carries_target_language() {
        let req = crate::models::translate::TranslateRequest {
            mode: TranslateMode::Translate,
            source_lang: "auto".into(),
            target_lang: "en".into(),
            tone: None,
            custom_note: None,
            text: "你好".into(),
        };
        let p = build_user_prompt(&req);
        assert!(p.contains("英语"));
        assert!(p.contains("你好"));
    }
}
