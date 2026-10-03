use serde::{Deserialize, Serialize};

/// 收益计算器商品信息（对应 revcalpublic 页面 Étape 1 表格行）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevCalProduct {
    pub asin: String,
    pub title: String,
    #[serde(default)]
    pub brand: Option<String>,
    #[serde(default)]
    pub image_url: Option<String>,
    #[serde(default)]
    pub product_link: Option<String>,
    #[serde(default)]
    pub length: Option<f64>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default)]
    pub dimension_unit: Option<String>,
    #[serde(default)]
    pub weight: Option<f64>,
    #[serde(default)]
    pub weight_unit: Option<String>,
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub fee_category: Option<String>,
    #[serde(default)]
    pub sales_rank: Option<i64>,
    #[serde(default)]
    pub sales_rank_context: Option<String>,
    #[serde(default)]
    pub reviews_count: Option<i64>,
    #[serde(default)]
    pub rating: Option<String>,
    #[serde(default)]
    pub offer_count: Option<i64>,
}

/// 单个查询码的结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevCalQueryResult {
    /// 用户输入的查询码（ASIN/UPC/EAN/关键词）
    pub code: String,
    /// 匹配到的商品（空表示未找到）
    pub products: Vec<RevCalProduct>,
    #[serde(default)]
    pub error: Option<String>,
}

impl RevCalQueryResult {
    pub fn found(&self) -> bool {
        !self.products.is_empty()
    }
}

/// 批量查询汇总
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevCalBatchResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub results: Vec<RevCalQueryResult>,
}

/// searchproduct 接口响应 DTO（camelCase，字段容错）
#[derive(Debug, Deserialize)]
struct ApiSearchResponse {
    succeed: bool,
    #[serde(default)]
    data: Option<ApiSearchData>,
}

#[derive(Debug, Deserialize)]
struct ApiSearchData {
    #[serde(default)]
    products: Vec<ApiProduct>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiProduct {
    asin: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    brand_name: Option<String>,
    #[serde(default)]
    image_url: Option<String>,
    #[serde(default)]
    link: Option<String>,
    #[serde(default)]
    length: Option<f64>,
    #[serde(default)]
    width: Option<f64>,
    #[serde(default)]
    height: Option<f64>,
    #[serde(default)]
    dimension_unit: Option<String>,
    #[serde(default)]
    weight: Option<f64>,
    #[serde(default)]
    weight_unit: Option<String>,
    #[serde(default)]
    price: Option<f64>,
    #[serde(default)]
    currency: Option<String>,
    #[serde(default)]
    fee_category_string: Option<String>,
    #[serde(default)]
    sales_rank: Option<i64>,
    #[serde(default)]
    sales_rank_context_name: Option<String>,
    #[serde(default)]
    customer_reviews_count: Option<i64>,
    #[serde(default)]
    customer_reviews_rating: Option<String>,
    #[serde(default)]
    offer_count: Option<i64>,
}

impl From<ApiProduct> for RevCalProduct {
    fn from(api: ApiProduct) -> Self {
        RevCalProduct {
            asin: api.asin,
            title: api.title,
            brand: api.brand_name,
            image_url: api.image_url,
            product_link: api.link,
            length: api.length,
            width: api.width,
            height: api.height,
            dimension_unit: api.dimension_unit,
            weight: api.weight,
            weight_unit: api.weight_unit,
            price: api.price,
            currency: api.currency,
            fee_category: api.fee_category_string,
            sales_rank: api.sales_rank,
            sales_rank_context: api.sales_rank_context_name,
            reviews_count: api.customer_reviews_count,
            rating: api.customer_reviews_rating,
            offer_count: api.offer_count,
        }
    }
}

/// 解析 searchproduct 响应为商品列表；succeed=false 或 JSON 非法时返回错误
pub fn parse_search_response(json: &str) -> Result<Vec<RevCalProduct>, String> {
    let resp: ApiSearchResponse =
        serde_json::from_str(json).map_err(|e| format!("解析响应失败: {}", e))?;
    if !resp.succeed {
        return Err("接口返回 succeed=false".to_string());
    }
    Ok(resp
        .data
        .map(|d| d.products.into_iter().map(Into::into).collect())
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    /// 真实接口捕获的响应样例（searchproduct B0GD7VRN9V countryCode=GB）
    const FIXTURE_SINGLE: &str = r#"{"succeed":true,"data":{"totalProductCount":1,"currentPage":1,"products":[{"asin":"B0GD7VRN9V","imageUrl":"https://m.media-amazon.com/images/I/51Qwz1Gu5oL._SL120_.jpg","thumbStringUrl":"https://m.media-amazon.com/images/I/51Qwz1Gu5oL._SL120_SL80_.jpg","gl":"gl_kitchen","title":"2-Burner Pro Camping Stove,7000W Camping Stove Gas Portable,Foldable Gas Stove,Windscreen Griddle, Portable Stove,Camping Essentials,Suitable For Outdoor Cooking,WinterMoot,Grilling","binding":"unknown_binding","brandName":"iPalamila","weightUnit":"kilograms","weightUnitStringId":"SC_FBA_UnitOfMeasure_Kilograms_45299","weight":4.8500,"dimensionUnit":"centimeters","dimensionUnitStringId":"SC_FBA_UnitOfMeasure_Centimeters_39147","width":30.2999,"length":20.2001,"height":34.9999,"currency":"GBP","price":69.99,"link":"https://www.amazon.co.uk/gp/product/B0GD7VRN9V/ref=xx_dp_cont_revecalc","isMyProduct":false,"salesRank":13871,"salesRankContextName":"Sports & Outdoors","customerReviewsCount":29,"customerReviewsRating":"4,1 sur 5 étoiles","customerReviewsRatingfullStarCount":4,"customerReviewsRatingValue":4.1,"offerCount":1,"feeCategoryString":"Cuisine"}]}}"#;

    #[test]
    fn parse_search_response_extracts_product_fields() {
        let products = super::parse_search_response(FIXTURE_SINGLE).expect("解析应成功");
        assert_eq!(products.len(), 1);
        let p = &products[0];
        assert_eq!(p.asin, "B0GD7VRN9V");
        assert_eq!(p.title, "2-Burner Pro Camping Stove,7000W Camping Stove Gas Portable,Foldable Gas Stove,Windscreen Griddle, Portable Stove,Camping Essentials,Suitable For Outdoor Cooking,WinterMoot,Grilling");
        assert_eq!(p.brand.as_deref(), Some("iPalamila"));
        // 页面 Dimensions du produit: 20,2 X 30,3 X 35 centimètres 4,85 kilogrammes
        assert_eq!(p.length, Some(20.2001));
        assert_eq!(p.width, Some(30.2999));
        assert_eq!(p.height, Some(34.9999));
        assert_eq!(p.weight, Some(4.85));
        assert_eq!(p.dimension_unit.as_deref(), Some("centimeters"));
        assert_eq!(p.weight_unit.as_deref(), Some("kilograms"));
        // 页面 Prix: 69.99
        assert_eq!(p.price, Some(69.99));
        assert_eq!(p.currency.as_deref(), Some("GBP"));
        assert_eq!(p.fee_category.as_deref(), Some("Cuisine"));
        assert_eq!(p.sales_rank, Some(13871));
        assert_eq!(p.reviews_count, Some(29));
        assert_eq!(p.offer_count, Some(1));
    }

    #[test]
    fn parse_search_response_handles_missing_fields() {
        // 部分商品响应缺字段（如 DE 站点缺 currency），不应解析失败
        let json = r#"{"succeed":true,"data":{"totalProductCount":1,"currentPage":1,"products":[{"asin":"B0001","title":"T1"}]}}"#;
        let products = super::parse_search_response(json).expect("缺字段应容错解析");
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].price, None);
        assert_eq!(products[0].currency, None);
    }

    #[test]
    fn parse_search_response_empty_products() {
        let json = r#"{"succeed":true,"data":{"totalProductCount":0,"currentPage":1,"products":[]}}"#;
        let products = super::parse_search_response(json).expect("空结果应解析成功");
        assert!(products.is_empty());
    }

    #[test]
    fn parse_search_response_rejects_invalid_json() {
        assert!(super::parse_search_response("not json").is_err());
    }
}
