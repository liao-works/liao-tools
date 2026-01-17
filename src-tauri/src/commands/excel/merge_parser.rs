use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read, Cursor};
use quick_xml::events::Event;
use quick_xml::Reader;
use crate::commands::error::CommandError;
use crate::models::excel::MergedRange;
use image::ImageFormat;

/// 单元格样式信息
#[derive(Debug, Clone, Default)]
pub struct CellStyle {
    pub number_format: Option<String>,      // 数字格式（如 "0.00", "General" 等）
    pub background_color: Option<String>,   // 背景颜色（RGB 十六进制）
    pub font_color: Option<String>,         // 字体颜色
    pub is_bold: bool,
}

/// 嵌入图片信息
#[derive(Debug, Clone)]
pub struct EmbeddedImage {
    pub image_id: String,          // 图片ID（如 ID_ACFEA68153BF450AAF4F180501501BB8）
    pub data: Vec<u8>,             // 图片二进制数据
    pub extension: String,         // 文件扩展名（png, jpg 等）
}

/// 浮动图片信息（包含位置）
#[derive(Debug, Clone)]
struct FloatingImageInfo {
    row: u32,
    col: u32,
    rid: String,
}

/// 工作表元数据（合并单元格、列宽、样式等）
#[derive(Debug, Default)]
pub struct SheetMetadata {
    pub merged_ranges: Vec<MergedRange>,
    pub column_widths: HashMap<u32, f64>,
    pub default_column_width: f64,
    pub cell_styles: HashMap<(u32, u32), CellStyle>,  // (row, col) -> 样式
    pub cell_formulas: HashMap<(u32, u32), String>,   // (row, col) -> 公式
    pub cell_images: HashMap<(u32, u32), EmbeddedImage>,  // (row, col) -> 嵌入图片
    pub converted_images: Vec<String>,  // 已转换的图片列表
    pub unsupported_images: Vec<String>,  // 无法处理的图片列表
}

/// 从 xlsx 文件中解析合并单元格信息
pub fn parse_merged_cells(file_path: &str) -> Result<Vec<MergedRange>, CommandError> {
    let metadata = parse_sheet_metadata(file_path)?;
    Ok(metadata.merged_ranges)
}

/// 从 xlsx 文件中解析工作表元数据（合并单元格、列宽、样式和图片）
pub fn parse_sheet_metadata(file_path: &str) -> Result<SheetMetadata, CommandError> {
    let file = File::open(file_path)
        .map_err(|e| CommandError::new(format!("打开文件失败: {}", e), "FILE_ERROR"))?;

    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CommandError::new(format!("解析 ZIP 文件失败: {}", e), "FILE_ERROR"))?;

    // 1. 解析样式文件
    let styles = if let Ok(styles_xml) = archive.by_name("xl/styles.xml") {
        let mut styles_content = String::new();
        BufReader::new(styles_xml).read_to_string(&mut styles_content)
            .map_err(|e| CommandError::new(format!("读取样式 XML 失败: {}", e), "FILE_ERROR"))?;
        parse_styles_xml(&styles_content)?
    } else {
        StylesInfo::default()
    };

    // 重新打开文件
    let file = File::open(file_path)
        .map_err(|e| CommandError::new(format!("打开文件失败: {}", e), "FILE_ERROR"))?;
    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CommandError::new(format!("解析 ZIP 文件失败: {}", e), "FILE_ERROR"))?;

    // 2. 读取所有媒体文件（图片）
    let (media_files, converted_images, unsupported_images) = read_media_files(&mut archive)?;

    // 重新打开文件
    let file = File::open(file_path)
        .map_err(|e| CommandError::new(format!("打开文件失败: {}", e), "FILE_ERROR"))?;
    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CommandError::new(format!("解析 ZIP 文件失败: {}", e), "FILE_ERROR"))?;

    // 3. 解析 cellimages.xml 获取图片ID -> rId 映射
    let id_to_rid = parse_cell_images_xml(&mut archive)?;

    // 重新打开文件
    let file = File::open(file_path)
        .map_err(|e| CommandError::new(format!("打开文件失败: {}", e), "FILE_ERROR"))?;
    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CommandError::new(format!("解析 ZIP 文件失败: {}", e), "FILE_ERROR"))?;

    // 4. 解析 cellimages.xml.rels 获取 rId -> 媒体文件 映射
    let rid_to_file = parse_cellimages_rels(&mut archive)?;

    // 重新打开文件
    let file = File::open(file_path)
        .map_err(|e| CommandError::new(format!("打开文件失败: {}", e), "FILE_ERROR"))?;
    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CommandError::new(format!("解析 ZIP 文件失败: {}", e), "FILE_ERROR"))?;

    // 4.5 从 drawing1.xml 解析图片 ID → rId 映射 以及浮动图片位置
    let (drawing_id_to_rid, floating_images) = parse_drawing_xml(&mut archive)?;

    // 重新打开文件
    let file = File::open(file_path)
        .map_err(|e| CommandError::new(format!("打开文件失败: {}", e), "FILE_ERROR"))?;
    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CommandError::new(format!("解析 ZIP 文件失败: {}", e), "FILE_ERROR"))?;

    // 4.6 从 drawing1.xml.rels 解析 rId → 媒体文件映射
    let drawing_rid_to_file = parse_drawing_rels(&mut archive)?;

    // 重新打开文件
    let file = File::open(file_path)
        .map_err(|e| CommandError::new(format!("打开文件失败: {}", e), "FILE_ERROR"))?;
    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CommandError::new(format!("解析 ZIP 文件失败: {}", e), "FILE_ERROR"))?;

    // 5. 解析工作表 XML
    let sheet_xml = archive.by_name("xl/worksheets/sheet1.xml")
        .map_err(|e| CommandError::new(format!("找不到工作表 XML: {}", e), "FILE_ERROR"))?;

    let mut xml_content = String::new();
    BufReader::new(sheet_xml).read_to_string(&mut xml_content)
        .map_err(|e| CommandError::new(format!("读取 XML 失败: {}", e), "FILE_ERROR"))?;

    let mut metadata = parse_metadata_from_xml(&xml_content, &styles)?;

    // 6. 关联图片到单元格
    // 优先使用 cellimages 映射 (WPS 嵌入图片)，如果为空则回退到 drawings 映射
    let final_id_to_rid = if id_to_rid.is_empty() { drawing_id_to_rid } else { id_to_rid };
    let final_rid_to_file = if rid_to_file.is_empty() { drawing_rid_to_file.clone() } else { rid_to_file };

    let image_mapping = ImageMappingInfo {
        id_to_rid: final_id_to_rid,
        rid_to_file: final_rid_to_file,
    };

    // 处理 DISPIMG 公式引用的图片
    link_images_to_cells(&mut metadata, &media_files, &image_mapping);

    // 处理浮动图片（直接通过位置关联）
    link_floating_images(&mut metadata, &media_files, &floating_images, &drawing_rid_to_file);

    // 保存图片处理信息
    metadata.converted_images = converted_images;
    metadata.unsupported_images = unsupported_images;

    Ok(metadata)
}

/// 读取 xl/media/ 目录中的所有图片文件
fn read_media_files(archive: &mut zip::ZipArchive<BufReader<File>>) -> Result<(HashMap<String, (Vec<u8>, String)>, Vec<String>, Vec<String>), CommandError> {
    let mut media_files = HashMap::new();
    let mut converted_images = Vec::new();
    let mut unsupported_images = Vec::new();

    let file_names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();


    for name in file_names {
        // 检查多个可能的图片存储位置
        if name.starts_with("xl/media/") || name.starts_with("xl/embeddings/") || name.contains("/media/") {
            if let Ok(mut file) = archive.by_name(&name) {
                let mut data = Vec::new();
                if file.read_to_end(&mut data).is_ok() && data.len() >= 8 {
                    let filename = name.rsplit('/').next().unwrap_or(&name);

                    if is_valid_image(&data) {
                        let ext = filename.rsplit('.').next().unwrap_or("png").to_string();
                        media_files.insert(filename.to_string(), (data, ext));
                    } else if let Some((converted_data, original_format)) = try_convert_image(&data) {
                        // 成功转换格式
                        media_files.insert(filename.to_string(), (converted_data, "png".to_string()));
                        converted_images.push(format!("{} ({}->PNG)", filename, original_format));
                    } else {
                        unsupported_images.push(filename.to_string());
                    }
                }
            }
        }
    }

    eprintln!("[DEBUG] 读取到 {} 个有效图片", media_files.len());
    if !converted_images.is_empty() {
        eprintln!("[INFO] 转换了 {} 个图片格式: {}",
            converted_images.len(),
            converted_images.join(", "));
    }
    if !unsupported_images.is_empty() {
        eprintln!("[警告] 跳过 {} 个无法处理的图片: {}",
            unsupported_images.len(),
            unsupported_images.join(", "));
    }
    Ok((media_files, converted_images, unsupported_images))
}

/// 尝试转换不支持的图片格式到 PNG
/// 返回：Some((转换后的PNG数据, 原始格式名)) 或 None（无法转换）
fn try_convert_image(data: &[u8]) -> Option<(Vec<u8>, String)> {
    if data.len() < 12 {
        return None;
    }

    // 检测图片格式
    let format = if data.starts_with(b"RIFF") && data.len() > 12 && &data[8..12] == b"WEBP" {
        Some((ImageFormat::WebP, "WebP"))
    } else {
        None
    };

    if let Some((img_format, format_name)) = format {
        // 尝试转换图片
        match image::load_from_memory_with_format(data, img_format) {
            Ok(img) => {
                // 转换为 PNG
                let mut png_data = Vec::new();
                let mut cursor = Cursor::new(&mut png_data);

                if img.write_to(&mut cursor, ImageFormat::Png).is_ok() {
                    return Some((png_data, format_name.to_string()));
                }
            }
            Err(e) => {
                eprintln!("[DEBUG] 转换 {} 格式失败: {}", format_name, e);
            }
        }
    }

    None
}

/// 检查是否是 rust_xlsxwriter 支持的图片格式（通过魔数识别）
/// 支持：PNG, JPEG, GIF, BMP
/// 不支持：WebP, EMF, WMF, SVG
fn is_valid_image(data: &[u8]) -> bool {
    if data.len() < 8 {
        return false;
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return true;
    }

    // JPEG: FF D8 FF
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return true;
    }

    // GIF: GIF87a or GIF89a
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return true;
    }

    // BMP: BM
    if data.starts_with(b"BM") {
        return true;
    }

    // 不支持的格式：
    // - WebP: RIFF....WEBP (Excel/rust_xlsxwriter 不支持)
    // - EMF/WMF: Windows 图元文件 (Excel 支持但 rust_xlsxwriter 暂不支持)
    // - SVG: 矢量图 (Excel 会转换为 PNG)

    false
}

/// 图片映射信息
#[derive(Debug, Default)]
struct ImageMappingInfo {
    /// 图片ID (如 ID_xxx) -> rId 的映射
    id_to_rid: HashMap<String, String>,
    /// rId -> 媒体文件名的映射
    rid_to_file: HashMap<String, String>,
}

/// 解析 xl/cellimages.xml 获取图片ID到rId的映射
fn parse_cell_images_xml(archive: &mut zip::ZipArchive<BufReader<File>>) -> Result<HashMap<String, String>, CommandError> {
    let mut image_id_map = HashMap::new();

    // 首先尝试读取 xl/cellimages.xml
    let cellimages_content = if let Ok(mut file) = archive.by_name("xl/cellimages.xml") {
        let mut content = String::new();
        file.read_to_string(&mut content).ok();
        content
    } else {
        String::new()
    };

    if cellimages_content.is_empty() {
        return Ok(image_id_map);
    }

    // 解析 cellimages.xml 获取 name (ID) 和 r:embed (rId)
    let mut reader = Reader::from_str(&cellimages_content);
    reader.trim_text(true);

    let mut current_name: Option<String> = None;
    let mut current_embed: Option<String> = None;
    let mut in_cell_image = false;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let local_name_bytes = e.name().local_name().as_ref().to_vec();
                let local_name = std::str::from_utf8(&local_name_bytes).unwrap_or("");

                if local_name == "cellImage" {
                    in_cell_image = true;
                    current_name = None;
                    current_embed = None;
                } else if local_name == "cNvPr" && in_cell_image {
                    // 获取 name 属性 (在 cNvPr 元素上，如 <xdr:cNvPr name="ID_xxx"/>)
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            if attr.key.local_name().as_ref() == b"name" {
                                current_name = Some(String::from_utf8_lossy(&attr.value).to_string());
                            }
                        }
                    }
                } else if local_name == "blip" && in_cell_image {
                    // 获取 r:embed 属性
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let key_bytes = attr.key.local_name().as_ref().to_vec();
                            let key = std::str::from_utf8(&key_bytes).unwrap_or("");
                            if key == "embed" {
                                current_embed = Some(String::from_utf8_lossy(&attr.value).to_string());
                            }
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                let local_name_bytes = e.name().local_name().as_ref().to_vec();
                let local_name = std::str::from_utf8(&local_name_bytes).unwrap_or("");
                if local_name == "cellImage" {
                    if let (Some(name), Some(embed)) = (current_name.take(), current_embed.take()) {
                        image_id_map.insert(name, embed);
                    }
                    in_cell_image = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    eprintln!("[DEBUG] cellimages.xml: {} 个映射", image_id_map.len());
    Ok(image_id_map)
}

/// 解析 xl/drawings/drawing1.xml 获取图片 ID (name) → rId 的映射，以及浮动图片位置信息
fn parse_drawing_xml(archive: &mut zip::ZipArchive<BufReader<File>>) -> Result<(HashMap<String, String>, Vec<FloatingImageInfo>), CommandError> {
    let mut id_to_rid = HashMap::new();
    let mut floating_images = Vec::new();

    let content = if let Ok(mut file) = archive.by_name("xl/drawings/drawing1.xml") {
        let mut s = String::new();
        file.read_to_string(&mut s).ok();
        s
    } else {
        String::new()
    };

    if content.is_empty() {
        return Ok((id_to_rid, floating_images));
    }

    // 解析 XML 获取 name (图片ID)、r:embed (rId) 和位置信息
    let mut reader = Reader::from_str(&content);
    reader.trim_text(true);

    let mut current_name: Option<String> = None;
    let mut current_embed: Option<String> = None;
    let mut current_row: Option<u32> = None;
    let mut current_col: Option<u32> = None;
    let mut in_anchor = false;
    let mut in_from = false;
    let mut in_pic = false;
    let mut in_row = false;
    let mut in_col = false;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name_local = e.name().local_name();
                let local_name = std::str::from_utf8(name_local.as_ref()).unwrap_or("");

                match local_name {
                    "twoCellAnchor" | "oneCellAnchor" => {
                        in_anchor = true;
                        current_name = None;
                        current_embed = None;
                        current_row = None;
                        current_col = None;
                    }
                    "from" if in_anchor => {
                        in_from = true;
                    }
                    "row" if in_from => {
                        in_row = true;
                    }
                    "col" if in_from => {
                        in_col = true;
                    }
                    "pic" if in_anchor => {
                        in_pic = true;
                    }
                    "cNvPr" if in_pic => {
                        // 获取 name 属性（图片ID）
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                if attr.key.local_name().as_ref() == b"name" {
                                    let name = String::from_utf8_lossy(&attr.value).to_string();
                                    current_name = Some(name);
                                }
                            }
                        }
                    }
                    "blip" if in_pic => {
                        // 获取 r:embed 属性
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                let key_local = attr.key.local_name();
                                let key = std::str::from_utf8(key_local.as_ref()).unwrap_or("");
                                if key == "embed" {
                                    current_embed = Some(String::from_utf8_lossy(&attr.value).to_string());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if in_row {
                    if let Ok(text) = e.unescape() {
                        current_row = text.parse().ok();
                    }
                } else if in_col {
                    if let Ok(text) = e.unescape() {
                        current_col = text.parse().ok();
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name_local = e.name().local_name();
                let local_name = std::str::from_utf8(name_local.as_ref()).unwrap_or("");
                match local_name {
                    "twoCellAnchor" | "oneCellAnchor" => {
                        // 保存浮动图片信息
                        if let (Some(row), Some(col), Some(rid)) = (current_row, current_col, current_embed.clone()) {
                            floating_images.push(FloatingImageInfo { row, col, rid });
                        }
                        // 保存 ID 映射（用于 DISPIMG 公式）
                        if let (Some(name), Some(embed)) = (current_name.take(), current_embed.take()) {
                            if name.starts_with("ID_") {
                                id_to_rid.insert(name, embed);
                            }
                        }
                        in_anchor = false;
                    }
                    "from" => {
                        in_from = false;
                    }
                    "row" => {
                        in_row = false;
                    }
                    "col" => {
                        in_col = false;
                    }
                    "pic" => {
                        in_pic = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    eprintln!("[DEBUG] drawing1.xml: {} 个ID映射, {} 个浮动图片", id_to_rid.len(), floating_images.len());
    Ok((id_to_rid, floating_images))
}

/// 解析 xl/drawings/_rels/drawing1.xml.rels 获取 rId → 媒体文件的映射
fn parse_drawing_rels(archive: &mut zip::ZipArchive<BufReader<File>>) -> Result<HashMap<String, String>, CommandError> {
    let mut rid_to_file = HashMap::new();

    let content = if let Ok(mut file) = archive.by_name("xl/drawings/_rels/drawing1.xml.rels") {
        let mut s = String::new();
        file.read_to_string(&mut s).ok();
        s
    } else {
        String::new()
    };

    if content.is_empty() {
        return Ok(rid_to_file);
    }

    // 解析 rels 文件
    let mut reader = Reader::from_str(&content);
    reader.trim_text(true);

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name_local = e.name().local_name();
                let local_name = std::str::from_utf8(name_local.as_ref()).unwrap_or("");

                if local_name == "Relationship" {
                    let mut rid: Option<String> = None;
                    let mut target: Option<String> = None;

                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let key_local = attr.key.local_name();
                            let key = std::str::from_utf8(key_local.as_ref()).unwrap_or("");
                            let value = String::from_utf8_lossy(&attr.value).to_string();
                            match key {
                                "Id" => rid = Some(value),
                                "Target" => target = Some(value),
                                _ => {}
                            }
                        }
                    }

                    if let (Some(id), Some(t)) = (rid, target) {
                        // 提取文件名
                        let filename = t.rsplit('/').next().unwrap_or(&t).to_string();
                        rid_to_file.insert(id, filename);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    eprintln!("[DEBUG] drawing1.xml.rels: {} 个映射", rid_to_file.len());
    Ok(rid_to_file)
}

/// 解析 xl/_rels/cellimages.xml.rels 获取 rId 到媒体文件的映射
fn parse_cellimages_rels(archive: &mut zip::ZipArchive<BufReader<File>>) -> Result<HashMap<String, String>, CommandError> {
    let mut rid_to_file = HashMap::new();

    // 尝试读取 rels 文件
    let rels_content = if let Ok(mut file) = archive.by_name("xl/_rels/cellimages.xml.rels") {
        let mut content = String::new();
        file.read_to_string(&mut content).ok();
        content
    } else {
        String::new()
    };

    if rels_content.is_empty() {
        return Ok(rid_to_file);
    }

    // 解析 rels 文件获取 Id (rId) 和 Target (媒体文件路径)
    let mut reader = Reader::from_str(&rels_content);
    reader.trim_text(true);

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let local_name_bytes = e.name().local_name().as_ref().to_vec();
                let local_name = std::str::from_utf8(&local_name_bytes).unwrap_or("");

                if local_name == "Relationship" {
                    let mut rid: Option<String> = None;
                    let mut target: Option<String> = None;

                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let key_local_name = attr.key.local_name();
                            let key_bytes = key_local_name.as_ref();
                            let key = std::str::from_utf8(key_bytes).unwrap_or("");
                            let value = String::from_utf8_lossy(&attr.value).to_string();
                            match key {
                                "Id" => rid = Some(value),
                                "Target" => target = Some(value),
                                _ => {}
                            }
                        }
                    }

                    if let (Some(id), Some(t)) = (rid, target) {
                        let filename = t.rsplit('/').next().unwrap_or(&t).to_string();
                        rid_to_file.insert(id, filename);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    eprintln!("[DEBUG] cellimages.xml.rels: {} 个映射", rid_to_file.len());
    Ok(rid_to_file)
}

/// 关联图片到包含 DISPIMG 公式的单元格
fn link_images_to_cells(
    metadata: &mut SheetMetadata,
    media_files: &HashMap<String, (Vec<u8>, String)>,
    image_mapping: &ImageMappingInfo,
) {
    if media_files.is_empty() {
        return;
    }

    // 收集所有带 DISPIMG 公式的单元格
    let dispimg_cells: Vec<((u32, u32), String)> = metadata.cell_formulas
        .iter()
        .filter(|(_, formula)| formula.contains("DISPIMG"))
        .map(|(k, v)| (*k, v.clone()))
        .collect();

    if dispimg_cells.is_empty() {
        return;
    }

    // 使用映射关系：图片ID -> rId -> 媒体文件名 -> 媒体数据
    for ((row, col), formula) in &dispimg_cells {
        if let Some(image_id) = extract_dispimg_id(formula) {
            if let Some(rid) = image_mapping.id_to_rid.get(&image_id) {
                if let Some(filename) = image_mapping.rid_to_file.get(rid) {
                    if let Some((data, ext)) = media_files.get(filename) {
                        if !data.is_empty() && data.len() >= 8 {
                            metadata.cell_images.insert((*row, *col), EmbeddedImage {
                                image_id: image_id.clone(),
                                data: data.clone(),
                                extension: ext.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    eprintln!("[DEBUG] 关联DISPIMG图片: {} 个", metadata.cell_images.len());
}

/// 关联浮动图片到单元格（通过 drawing 位置信息）
fn link_floating_images(
    metadata: &mut SheetMetadata,
    media_files: &HashMap<String, (Vec<u8>, String)>,
    floating_images: &[FloatingImageInfo],
    rid_to_file: &HashMap<String, String>,
) {
    if media_files.is_empty() || floating_images.is_empty() {
        return;
    }

    let mut linked_count = 0;
    for img_info in floating_images {
        // 如果该位置已经有图片（来自 DISPIMG），跳过
        if metadata.cell_images.contains_key(&(img_info.row, img_info.col)) {
            continue;
        }

        // 通过 rId 找到媒体文件名
        if let Some(filename) = rid_to_file.get(&img_info.rid) {
            if let Some((data, ext)) = media_files.get(filename) {
                if !data.is_empty() && data.len() >= 8 {
                    metadata.cell_images.insert((img_info.row, img_info.col), EmbeddedImage {
                        image_id: format!("floating_{}_{}_{}", img_info.row, img_info.col, &img_info.rid),
                        data: data.clone(),
                        extension: ext.to_string(),
                    });
                    linked_count += 1;
                }
            }
        }
    }

    eprintln!("[DEBUG] 关联浮动图片: {} 个", linked_count);
}

/// 从 DISPIMG 公式中提取图片ID
fn extract_dispimg_id(formula: &str) -> Option<String> {
    // 格式: =DISPIMG("ID_ACFEA68153BF450AAF4F180501501BB8",1)
    let start = formula.find("DISPIMG(\"")?;
    let after_start = &formula[start + 9..]; // 跳过 DISPIMG("
    let end = after_start.find("\"")?;
    Some(after_start[..end].to_string())
}

/// 样式信息（从 styles.xml 解析）
#[derive(Debug, Default)]
struct StylesInfo {
    number_formats: HashMap<u32, String>,     // numFmtId -> format code
    fills: Vec<Option<String>>,                // 填充颜色列表
    cell_xfs: Vec<CellXf>,                     // 单元格格式索引
}

/// 单元格格式定义
#[derive(Debug, Default, Clone)]
struct CellXf {
    num_fmt_id: u32,
    fill_id: u32,
    apply_number_format: bool,
    apply_fill: bool,
}

/// 解析 styles.xml
fn parse_styles_xml(xml: &str) -> Result<StylesInfo, CommandError> {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut styles = StylesInfo::default();

    // 添加内置数字格式
    styles.number_formats.insert(0, "General".to_string());
    styles.number_formats.insert(1, "0".to_string());
    styles.number_formats.insert(2, "0.00".to_string());
    styles.number_formats.insert(49, "@".to_string()); // 文本格式

    let mut in_num_fmts = false;
    let mut in_fills = false;
    let mut in_cell_xfs = false;
    let mut current_fill_color: Option<String> = None;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                match e.name().as_ref() {
                    b"numFmts" => in_num_fmts = true,
                    b"numFmt" if in_num_fmts => {
                        let mut num_fmt_id: Option<u32> = None;
                        let mut format_code: Option<String> = None;

                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                match attr.key.as_ref() {
                                    b"numFmtId" => {
                                        num_fmt_id = String::from_utf8_lossy(&attr.value).parse().ok();
                                    }
                                    b"formatCode" => {
                                        format_code = Some(String::from_utf8_lossy(&attr.value).to_string());
                                    }
                                    _ => {}
                                }
                            }
                        }

                        if let (Some(id), Some(code)) = (num_fmt_id, format_code) {
                            styles.number_formats.insert(id, code);
                        }
                    }
                    b"fills" => in_fills = true,
                    b"fill" if in_fills => {
                        current_fill_color = None;
                    }
                    b"patternFill" if in_fills => {
                        // 检查 patternType
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                if attr.key.as_ref() == b"patternType" {
                                    let pattern = String::from_utf8_lossy(&attr.value);
                                    if pattern == "none" {
                                        current_fill_color = None;
                                    }
                                }
                            }
                        }
                    }
                    b"fgColor" if in_fills => {
                        // 前景色（通常是填充颜色）
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                match attr.key.as_ref() {
                                    b"rgb" => {
                                        let color = String::from_utf8_lossy(&attr.value).to_string();
                                        // ARGB 格式，取后6位作为RGB
                                        if color.len() >= 6 {
                                            current_fill_color = Some(color[color.len()-6..].to_string());
                                        }
                                    }
                                    b"theme" | b"indexed" => {
                                        // 主题色或索引色，暂不支持详细解析
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    b"cellXfs" => in_cell_xfs = true,
                    b"xf" if in_cell_xfs => {
                        let mut xf = CellXf::default();

                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                let value = String::from_utf8_lossy(&attr.value);
                                match attr.key.as_ref() {
                                    b"numFmtId" => {
                                        xf.num_fmt_id = value.parse().unwrap_or(0);
                                    }
                                    b"fillId" => {
                                        xf.fill_id = value.parse().unwrap_or(0);
                                    }
                                    b"applyNumberFormat" => {
                                        xf.apply_number_format = value == "1" || value == "true";
                                    }
                                    b"applyFill" => {
                                        xf.apply_fill = value == "1" || value == "true";
                                    }
                                    _ => {}
                                }
                            }
                        }

                        styles.cell_xfs.push(xf);
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                match e.name().as_ref() {
                    b"numFmts" => in_num_fmts = false,
                    b"fill" if in_fills => {
                        styles.fills.push(current_fill_color.take());
                    }
                    b"fills" => in_fills = false,
                    b"cellXfs" => in_cell_xfs = false,
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(CommandError::new(format!("样式 XML 解析错误: {}", e), "PARSE_ERROR")),
            _ => {}
        }
        buf.clear();
    }

    Ok(styles)
}

/// 从 XML 内容中解析工作表元数据
fn parse_metadata_from_xml(xml: &str, styles: &StylesInfo) -> Result<SheetMetadata, CommandError> {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut metadata = SheetMetadata::default();
    metadata.default_column_width = 8.43; // Excel 默认列宽

    let mut in_merge_cells = false;
    let mut in_cols = false;
    let mut in_sheet_data = false;
    let mut in_cell = false;
    let mut in_formula = false;
    let mut current_cell_ref: Option<String> = None;
    let mut current_style_idx: Option<u32> = None;
    let mut current_formula: Option<String> = None;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                match e.name().as_ref() {
                    b"mergeCells" => in_merge_cells = true,
                    b"mergeCell" if in_merge_cells => {
                        // 读取 ref 属性
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                if attr.key.as_ref() == b"ref" {
                                    let value = String::from_utf8_lossy(&attr.value);
                                    if let Some(range) = parse_cell_range(&value) {
                                        metadata.merged_ranges.push(range);
                                    }
                                }
                            }
                        }
                    }
                    b"cols" => in_cols = true,
                    b"sheetFormatPr" => {
                        // 解析默认列宽
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                if attr.key.as_ref() == b"defaultColWidth" {
                                    let value = String::from_utf8_lossy(&attr.value);
                                    if let Ok(w) = value.parse::<f64>() {
                                        metadata.default_column_width = w;
                                    }
                                }
                            }
                        }
                    }
                    b"sheetData" => in_sheet_data = true,
                    b"c" if in_sheet_data => {
                        // 开始解析单元格
                        in_cell = true;
                        current_cell_ref = None;
                        current_style_idx = None;
                        current_formula = None;

                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                match attr.key.as_ref() {
                                    b"r" => {
                                        current_cell_ref = Some(String::from_utf8_lossy(&attr.value).to_string());
                                    }
                                    b"s" => {
                                        current_style_idx = String::from_utf8_lossy(&attr.value).parse().ok();
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    b"f" if in_cell => {
                        // 开始读取公式
                        in_formula = true;
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                match e.name().as_ref() {
                    b"mergeCell" if in_merge_cells => {
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                if attr.key.as_ref() == b"ref" {
                                    let value = String::from_utf8_lossy(&attr.value);
                                    if let Some(range) = parse_cell_range(&value) {
                                        metadata.merged_ranges.push(range);
                                    }
                                }
                            }
                        }
                    }
                    b"col" if in_cols => {
                        // 解析列宽定义
                        let mut min_col: Option<u32> = None;
                        let mut max_col: Option<u32> = None;
                        let mut width: Option<f64> = None;

                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                let key = attr.key.as_ref();
                                let value = String::from_utf8_lossy(&attr.value);
                                match key {
                                    b"min" => min_col = value.parse().ok(),
                                    b"max" => max_col = value.parse().ok(),
                                    b"width" => width = value.parse().ok(),
                                    _ => {}
                                }
                            }
                        }

                        if let (Some(min), Some(max), Some(w)) = (min_col, max_col, width) {
                            for col in min..=max {
                                metadata.column_widths.insert(col - 1, w);
                            }
                        }
                    }
                    b"sheetFormatPr" => {
                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                if attr.key.as_ref() == b"defaultColWidth" {
                                    let value = String::from_utf8_lossy(&attr.value);
                                    if let Ok(w) = value.parse::<f64>() {
                                        metadata.default_column_width = w;
                                    }
                                }
                            }
                        }
                    }
                    b"c" if in_sheet_data => {
                        // 空单元格（只有样式没有内容）
                        let mut cell_ref: Option<String> = None;
                        let mut style_idx: Option<u32> = None;

                        for attr in e.attributes() {
                            if let Ok(attr) = attr {
                                match attr.key.as_ref() {
                                    b"r" => {
                                        cell_ref = Some(String::from_utf8_lossy(&attr.value).to_string());
                                    }
                                    b"s" => {
                                        style_idx = String::from_utf8_lossy(&attr.value).parse().ok();
                                    }
                                    _ => {}
                                }
                            }
                        }

                        if let (Some(ref_str), Some(s_idx)) = (cell_ref, style_idx) {
                            if let Some((row, col)) = parse_cell_reference(&ref_str) {
                                let cell_style = resolve_cell_style(s_idx, styles);
                                if cell_style.number_format.is_some() || cell_style.background_color.is_some() {
                                    metadata.cell_styles.insert((row, col), cell_style);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if in_formula {
                    // 读取公式内容
                    current_formula = Some(e.unescape().unwrap_or_default().to_string());
                }
            }
            Ok(Event::End(e)) => {
                match e.name().as_ref() {
                    b"mergeCells" => in_merge_cells = false,
                    b"cols" => in_cols = false,
                    b"sheetData" => in_sheet_data = false,
                    b"c" if in_cell => {
                        // 单元格结束，保存样式和公式
                        if let Some(ref_str) = &current_cell_ref {
                            if let Some((row, col)) = parse_cell_reference(ref_str) {
                                // 保存样式
                                if let Some(s_idx) = current_style_idx {
                                    let cell_style = resolve_cell_style(s_idx, styles);
                                    if cell_style.number_format.is_some() || cell_style.background_color.is_some() {
                                        metadata.cell_styles.insert((row, col), cell_style);
                                    }
                                }
                                // 保存公式
                                if let Some(formula) = current_formula.take() {
                                    if !formula.is_empty() {
                                        let full_formula = format!("={}", formula);
                                        metadata.cell_formulas.insert((row, col), full_formula);
                                    }
                                }
                            }
                        }
                        in_cell = false;
                        current_cell_ref = None;
                        current_style_idx = None;
                    }
                    b"f" => {
                        in_formula = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(CommandError::new(format!("XML 解析错误: {}", e), "PARSE_ERROR")),
            _ => {}
        }
        buf.clear();
    }

    Ok(metadata)
}

/// 根据样式索引解析单元格样式
fn resolve_cell_style(style_idx: u32, styles: &StylesInfo) -> CellStyle {
    let mut cell_style = CellStyle::default();

    if let Some(xf) = styles.cell_xfs.get(style_idx as usize) {
        // 数字格式
        if let Some(fmt) = styles.number_formats.get(&xf.num_fmt_id) {
            cell_style.number_format = Some(fmt.clone());
        } else if xf.num_fmt_id == 0 {
            cell_style.number_format = Some("General".to_string());
        }

        // 填充颜色
        if let Some(color) = styles.fills.get(xf.fill_id as usize) {
            cell_style.background_color = color.clone();
        }
    }

    cell_style
}

/// 解析单元格范围字符串（例如 "A1:B3"）
fn parse_cell_range(range_str: &str) -> Option<MergedRange> {
    let parts: Vec<&str> = range_str.split(':').collect();
    if parts.len() != 2 {
        return None;
    }

    let start = parse_cell_reference(parts[0])?;
    let end = parse_cell_reference(parts[1])?;

    Some(MergedRange {
        start_row: start.0,
        start_col: start.1,
        end_row: end.0,
        end_col: end.1,
    })
}

/// 解析单元格引用（例如 "A1" -> (0, 0)）
fn parse_cell_reference(cell_ref: &str) -> Option<(u32, u32)> {
    let mut col = 0u32;
    let mut row_str = String::new();

    for ch in cell_ref.chars() {
        if ch.is_alphabetic() {
            col = col * 26 + (ch.to_ascii_uppercase() as u32 - 'A' as u32 + 1);
        } else if ch.is_numeric() {
            row_str.push(ch);
        }
    }

    let row: u32 = row_str.parse().ok()?;

    // Excel 是从 1 开始的，转换为从 0 开始
    Some((row - 1, col - 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cell_reference() {
        assert_eq!(parse_cell_reference("A1"), Some((0, 0)));
        assert_eq!(parse_cell_reference("B2"), Some((1, 1)));
        assert_eq!(parse_cell_reference("Z10"), Some((9, 25)));
        assert_eq!(parse_cell_reference("AA1"), Some((0, 26)));
    }

    #[test]
    fn test_parse_cell_range() {
        let range = parse_cell_range("A1:B3").unwrap();
        assert_eq!(range.start_row, 0);
        assert_eq!(range.start_col, 0);
        assert_eq!(range.end_row, 2);
        assert_eq!(range.end_col, 1);
    }
}
