from __future__ import annotations

from typing import Any


class RecommendationService:
    def generate(self, measurements: dict[str, Any], crop: str | None, language: str = "en") -> list[dict[str, Any]]:
        recommendations: list[dict[str, Any]] = []
        ph = measurements.get("ph")
        carbon = measurements.get("organic_carbon")
        nitrogen = measurements.get("available_nitrogen")
        phosphorus = measurements.get("available_phosphorus")
        potassium = measurements.get("available_potassium")

        if ph is not None and ph < 5.5:
            recommendations.append({
                "title": "Apply liming and review soil acidity" if language == "en" else "खरपतवार के लिए चूना लगाएं और अम्लता की जांच करें",
                "reason": "Soil pH is acidic and may limit nutrient uptake." if language == "en" else "मिट्टी का pH अम्लीय है और पोषक तत्वों के अवशोषण को सीमित कर सकता है।",
                "priority": "high",
                "explanation": "Use a soil test based lime plan and recheck pH before the next crop cycle." if language == "en" else "अगली फसल चक्र से पहले मिट्टी परीक्षण आधारित चूना योजना का उपयोग करें और pH फिर से जांचें।",
            })
        if carbon is not None and carbon < 0.5:
            recommendations.append({
                "title": "Add organic matter" if language == "en" else "जैविक पदार्थ जोड़ें",
                "reason": "Organic carbon is low, which can reduce water retention and biological activity." if language == "en" else "जैविक कार्बन कम है, जिससे पानी धारण और जैविक गतिविधि कम हो सकती है।",
                "priority": "medium",
                "explanation": "Add compost, FYM, or crop residues according to local recommendations and avoid over-application." if language == "en" else "स्थानीय सलाह के अनुसार कम्पोस्ट, FYM या फसल अवशेष जोड़ें और अधिक उपयोग से बचें।",
            })
        if nitrogen is not None and nitrogen < 150:
            recommendations.append({
                "title": "Review nitrogen management" if language == "en" else "नाइट्रोजन प्रबंधन की समीक्षा करें",
                "reason": "Available nitrogen may be insufficient for strong crop growth." if language == "en" else "उपलब्ध नाइट्रोजन पर्याप्त नहीं हो सकता है, जिससे फसल की वृद्धि कमजोर रह सकती है।",
                "priority": "medium",
                "explanation": "Apply nitrogen only according to crop stage and local extension advice." if language == "en" else "फसल की अवस्था और स्थानीय अनुशंसा के अनुसार ही नाइट्रोजन लगाएं।",
            })
        if phosphorus is not None and phosphorus < 20:
            recommendations.append({
                "title": "Check phosphorus sufficiency" if language == "en" else "फास्फोरस की पर्याप्तता की जांच करें",
                "reason": "Phosphorus may be limiting root development and flowering." if language == "en" else "फास्फोरस जड़ विकास और फूल आने को सीमित कर सकता है।",
                "priority": "medium",
                "explanation": "Use a balanced crop nutrient plan rather than making a single-factor correction." if language == "en" else "एकल-कारक सुधार के बजाय संतुलित फसल पोषक योजना का उपयोग करें।",
            })
        if potassium is not None and potassium < 100:
            recommendations.append({
                "title": "Improve potassium balance" if language == "en" else "पोटेशियम संतुलन सुधारें",
                "reason": "Potassium deficiency can increase stress susceptibility and reduce quality." if language == "en" else "पोटेशियम की कमी से फसल की लचीलापन और गुणवत्ता प्रभावित हो सकती है।",
                "priority": "medium",
                "explanation": "Reassess the field's potassium status before making amendments." if language == "en" else "संशोधन से पहले खेत की पोटेशियम स्थिति की फिर से जांच करें।",
            })

        if not recommendations:
            recommendations.append({
                "title": "Continue regular monitoring" if language == "en" else "नियमित निगरानी जारी रखें",
                "reason": "The available measurements do not indicate an obvious deficiency." if language == "en" else "उपलब्ध मापों से कोई स्पष्ट कमी नहीं दिखाई देती है।",
                "priority": "low",
                "explanation": "Keep sampling and review patterns over time to understand seasonal changes." if language == "en" else "मौसमी बदलावों को समझने के लिए समय-समय पर नमूने लेते रहें और समीक्षा करते रहें।",
            })
        return recommendations
