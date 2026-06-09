"use client";

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type LanguageCode = "en" | "ru" | "uz";

const dictionary: Record<string, Record<string, string>> = {
  en: {
    "nav.aria": "Primary navigation",
    "nav.brand": "AI-BI",
    "nav.home": "Home",
    "nav.dashboard": "Dashboard",
    "nav.logout": "Logout",
    "nav.logoutConfirm": "Are you sure you want to log out?",
    "lang.switch": "Language",

    heroBadge: "SMB-ready analytics",
    heroTitle: "AI Business Intelligence Platform",
    heroSubtitle:
      "Upload your sales data, let the pipeline clean and structure it, then explore customer segments and charts built for owners who need answers fast—not another spreadsheet maze.",
    goDashboard: "Go to Dashboard",
    platformSublead: "Segmentation, PCA maps, and dashboards—wired to your FastAPI backend.",
    feature1Title: "Clean pipelines",
    feature1Body: "Ingest CSV & Excel, standardize fields, and preview quality in one flow.",
    feature2Title: "ML segmentation",
    feature2Body: "K-Means clusters and PCA coordinates ready for Recharts visualizations.",
    feature3Title: "Owner-friendly UI",
    feature3Body: "A focused workspace so teams spend time on decisions, not tooling.",

    "dashboard.workspace": "Workspace",
    "dashboard.title": "Intelligence dashboard",
    "dashboard.subtitle":
      "Ingest sales files, review data health, then run K-Means + PCA to map customer segments in two dimensions—ready for executive-ready visuals.",
    "dashboard.api": "API",
    "dashboard.errorTitle": "Request failed",
    "dashboard.errorNoUpload": "Upload a dataset first so we have rows to segment.",
    "dashboard.errorAxiosMessage": "Request failed",
    "dashboard.errorUnknown": "Something went wrong",
    "dashboard.uploadTitle": "Data upload",
    "dashboard.uploadBody.before": "CSV or Excel files are sent to",
    "dashboard.uploadBody.after": "for cleaning and EDA.",
    "dashboard.uploading": "Uploading…",
    uploadFile: "Upload file",
    "dashboard.running": "Running…",
    "dashboard.runSegmentation": "Run AI Segmentation",
    "dashboard.file": "File",
    "dashboard.imputation": "Imputation",
    "dashboard.previewRows": "Preview rows",
    "dashboard.previewHint":
      "Segmentation now uses all cleaned rows returned by the API for full-file clustering.",
    "dashboard.stat.totalRows": "Total rows",
    "dashboard.stat.totalRowsHint": "Cleaned dataset size",
    "dashboard.stat.columns": "Columns",
    "dashboard.stat.columnsHint": "Fields after cleaning",
    "dashboard.stat.missing": "Missing values",
    "dashboard.stat.missingHint": "Post-clean residual nulls",
    "dashboard.stat.clusters": "Clusters (last run)",
    "dashboard.stat.clustersHint": "Distinct K-Means groups",
    "dashboard.modelContext": "Model context",
    "dashboard.featuresUsed": "Features used:",
    "dashboard.chartTitle": "Customer similarity map",
    "dashboard.customerSegmentation": "Customer segmentation",
    "dashboard.chartSubtitle":
      "Two-dimensional embedding of numeric purchasing signals, colored by cluster.",
    "dashboard.chart.explain.title": "How to read this map",
    "dashboard.chart.explain.body":
      "PCA1 and PCA2 are relative axes built from many numeric features. Value 0 is the center, and +/- values are directions only (not good or bad). Points close to each other are similar customers; far points represent more different behavior.",
    "dashboard.emptyChartTitle": "No segmentation chart yet",
    "dashboard.emptyChartBefore": "Upload a dataset, then choose",
    "dashboard.emptyChartAfter": "to plot PCA coordinates from the API response.",
    "dashboard.chartLoading": "Loading chart…",
    "dashboard.clusterInsights.title": "Cluster Insights",
    "dashboard.clusterInsights.subtitle": "AI interpretation of customer segments",
    "dashboard.clusterInsights.clusterPrefix": "Cluster",
    "dashboard.clusterInsights.customerCount": "customers",
    "dashboard.clusterInsights.empty": "Run segmentation to generate cluster interpretations.",
    "dashboard.clusterInsights.label.average": "Average Customers",
    "dashboard.clusterInsights.label.vip": "VIP / High Value",
    "dashboard.clusterInsights.label.risk": "At-Risk / Churning",
    "dashboard.clusterInsights.label.custom": "Additional Segment",
    "dashboard.kpi.total_revenue": "Total Revenue",
    "dashboard.kpi.total_customers": "Total Customers",
    "dashboard.kpi.risk_revenue": "Revenue at Risk",
    "dashboard.kpi.avg_per_customer": "Avg per customer",
    "dashboard.kpi.active_clusters": "Active clusters",
    "dashboard.kpi.risk_share": "Risk share",
    "dashboard.chart.donut_title": "Revenue Distribution",
    "dashboard.forecast.title": "Sales Forecasting (AI)",
    "dashboard.forecast.subtitle": "30-day AI prediction based on historical data",
    "dashboard.forecast.disclaimer":
      "Forecasts are estimates based on historical patterns and may not be 100% accurate.",
    "dashboard.forecast.generate30": "Generate 30-Day Forecast",
    "dashboard.forecast.loading": "Generating forecast…",
    "dashboard.forecast.using": "Using columns",
    "dashboard.forecast.actual": "Historical sales",
    "dashboard.forecast.predicted": "Predicted sales",
    "dashboard.forecast.empty": "Click the button to generate forecast",
    "dashboard.forecast.errorInferColumns":
      "Could not infer date and sales columns. Make sure your dataset includes a date field and a numeric sales field.",
    "dashboard.chat.title": "AI Business Advisor",
    "dashboard.chat.quickTitle": "Quick prompts",
    "dashboard.chat.quick.vip": "Who are my VIP customers?",
    "dashboard.chat.quick.risk": "Which customers are at risk?",
    "dashboard.chat.quick.forecast": "Summarize next 30 days forecast",
    "dashboard.chat.placeholder": "Ask about your data (e.g., Who are my VIPs?)...",
    "dashboard.chat.send": "Send",
    "dashboard.chat.typing": "AI is thinking...",
    "dashboard.export.pdf": "Export PDF",
    "dashboard.export.excel": "Export Excel",
    "excel.transaction_id": "Transaction ID",
    "excel.customer_name": "Customer Name",
    "excel.total_spent_usd": "Total Spent (USD)",
    "excel.purchase_frequency": "Purchase Frequency",
    "excel.days_since_last_purchase": "Days Since Last Purchase",
    "excel.cluster": "Cluster",

    "chart.cluster": "Cluster",
    "chart.group": "Group",
    "chart.pca1": "Similarity axis A",
    "chart.pca2": "Similarity axis B",
    "chart.tooltipPoint": "Point",
    "dashboard.insights.title": "Actionable Insights",
    "dashboard.insights.subtitle": "Recommended next actions from current segmentation",
    "dashboard.drilldown.title": "Group drill-down",
    "dashboard.drilldown.subtitle": "Inspect customers inside a selected group",
    "dashboard.drilldown.allGroups": "All groups",
    "dashboard.drilldown.empty": "No rows available for this selection.",
    "dashboard.drilldown.col.name": "Customer",
    "dashboard.drilldown.col.id": "Transaction ID",
    "dashboard.drilldown.col.spend": "Spend (USD)",
    "dashboard.drilldown.col.freq": "Purchase frequency",
    "dashboard.drilldown.col.recency": "Days since last purchase",
    "dashboard.drilldown.col.group": "Group",
    "dashboard.drilldown.searchPlaceholder": "Search by customer, ID, or group...",
    "dashboard.drilldown.prev": "Previous",
    "dashboard.drilldown.next": "Next",
    "dashboard.drilldown.pageStatus": "Page {page}/{total} • {count} rows",
    "dashboard.drilldown.exportCsv": "Export filtered CSV",
  },
  ru: {
    "nav.aria": "Основная навигация",
    "nav.brand": "AI-BI",
    "nav.home": "Главная",
    "nav.dashboard": "Панель аналитики",
    "nav.logout": "Выйти",
    "nav.logoutConfirm": "Вы действительно хотите выйти?",
    "lang.switch": "Язык",

    heroBadge: "Аналитика для малого и среднего бизнеса",
    heroTitle: "Платформа бизнес-аналитики на базе ИИ",
    heroSubtitle:
      "Загрузите данные продаж — конвейер очистит и структурирует их, после чего вы сможете изучать сегменты клиентов и диаграммы для руководителей, которым нужны ответы, а не новый лабиринт таблиц.",
    goDashboard: "Перейти в панель аналитики",
    platformSublead: "Сегментация, карты PCA и дашборды — интеграция с вашим бэкендом на FastAPI.",
    feature1Title: "Надёжные конвейеры данных",
    feature1Body: "Импорт CSV и Excel, стандартизация полей и предпросмотр качества в одном потоке.",
    feature2Title: "ML-сегментация",
    feature2Body: "Кластеры K-средних и координаты PCA готовы для визуализации в Recharts.",
    feature3Title: "Интерфейс для владельцев",
    feature3Body: "Сфокусированное рабочее пространство, чтобы команды тратили время на решения, а не на инструменты.",

    "dashboard.workspace": "Рабочая область",
    "dashboard.title": "Панель бизнес-аналитики",
    "dashboard.subtitle":
      "Загрузите файлы продаж, оцените качество данных, затем выполните K-средних + PCA, чтобы отобразить сегменты клиентов в двух измерениях.",
    "dashboard.api": "API",
    "dashboard.errorTitle": "Ошибка запроса",
    "dashboard.errorNoUpload": "Сначала загрузите набор данных, чтобы выполнить сегментацию.",
    "dashboard.errorAxiosMessage": "Ошибка запроса",
    "dashboard.errorUnknown": "Что-то пошло не так",
    "dashboard.uploadTitle": "Загрузка данных",
    "dashboard.uploadBody.before": "Файлы CSV или Excel отправляются на",
    "dashboard.uploadBody.after": "для очистки и разведочного анализа.",
    "dashboard.uploading": "Загрузка…",
    uploadFile: "Загрузить файл",
    "dashboard.running": "Выполнение…",
    "dashboard.runSegmentation": "Запустить AI-сегментацию",
    "dashboard.file": "Файл",
    "dashboard.imputation": "Импутация",
    "dashboard.previewRows": "Строк предпросмотра",
    "dashboard.previewHint":
      "Сегментация использует все очищенные строки из API для кластеризации всего файла.",
    "dashboard.stat.totalRows": "Всего строк",
    "dashboard.stat.totalRowsHint": "Размер очищенного набора",
    "dashboard.stat.columns": "Столбцов",
    "dashboard.stat.columnsHint": "Поля после очистки",
    "dashboard.stat.missing": "Пропущенные значения",
    "dashboard.stat.missingHint": "Остаточные пропуски после очистки",
    "dashboard.stat.clusters": "Кластеров (последний запуск)",
    "dashboard.stat.clustersHint": "Различные группы K-средних",
    "dashboard.modelContext": "Контекст модели",
    "dashboard.featuresUsed": "Использованные признаки:",
    "dashboard.chartTitle": "Карта похожести клиентов",
    "dashboard.customerSegmentation": "Сегментация клиентов",
    "dashboard.chartSubtitle":
      "Двумерное вложение числовых признаков покупательского поведения, цвет по кластеру.",
    "dashboard.chart.explain.title": "Как читать эту карту",
    "dashboard.chart.explain.body":
      "PCA1 и PCA2 — относительные оси, собранные из нескольких числовых признаков. Значение 0 — центр, а +/- показывает только направление (не хорошо/плохо). Близкие точки — похожие клиенты, далекие точки — более разное поведение.",
    "dashboard.emptyChartTitle": "Диаграмма сегментации пока недоступна",
    "dashboard.emptyChartBefore": "Загрузите набор данных, затем нажмите",
    "dashboard.emptyChartAfter": "чтобы построить координаты PCA из ответа API.",
    "dashboard.chartLoading": "Загрузка диаграммы…",
    "dashboard.clusterInsights.title": "Анализ кластеров",
    "dashboard.clusterInsights.subtitle": "ИИ анализ сегментов клиентов",
    "dashboard.clusterInsights.clusterPrefix": "Кластер",
    "dashboard.clusterInsights.customerCount": "клиентов",
    "dashboard.clusterInsights.empty":
      "Запустите сегментацию, чтобы получить интерпретацию кластеров.",
    "dashboard.clusterInsights.label.average": "Обычные клиенты",
    "dashboard.clusterInsights.label.vip": "VIP / Высокий доход",
    "dashboard.clusterInsights.label.risk": "В зоне риска",
    "dashboard.clusterInsights.label.custom": "Дополнительный сегмент",
    "dashboard.kpi.total_revenue": "Общий Доход",
    "dashboard.kpi.total_customers": "Всего Клиентов",
    "dashboard.kpi.risk_revenue": "Доход под Угрозой",
    "dashboard.kpi.avg_per_customer": "Средний доход на клиента",
    "dashboard.kpi.active_clusters": "Активные кластеры",
    "dashboard.kpi.risk_share": "Доля риска",
    "dashboard.chart.donut_title": "Распределение Доходов",
    "dashboard.forecast.title": "Прогнозирование продаж (ИИ)",
    "dashboard.forecast.subtitle": "30-дневный ИИ прогноз на основе исторических данных",
    "dashboard.forecast.disclaimer":
      "Прогноз основан на исторических данных и не гарантирует 100% точность.",
    "dashboard.forecast.generate30": "Создать прогноз на 30 дней",
    "dashboard.forecast.loading": "Формирование прогноза…",
    "dashboard.forecast.using": "Используются столбцы",
    "dashboard.forecast.actual": "Исторические продажи",
    "dashboard.forecast.predicted": "Прогноз продаж",
    "dashboard.forecast.empty": "Нажмите кнопку для создания прогноза",
    "dashboard.forecast.errorInferColumns":
      "Не удалось определить столбцы даты и продаж. Проверьте, что в наборе есть дата и числовой столбец продаж.",
    "dashboard.chat.title": "ИИ Бизнес-Консультант",
    "dashboard.chat.quickTitle": "Быстрые запросы",
    "dashboard.chat.quick.vip": "Кто мои VIP-клиенты?",
    "dashboard.chat.quick.risk": "Какие клиенты в зоне риска?",
    "dashboard.chat.quick.forecast": "Краткий прогноз на 30 дней",
    "dashboard.chat.placeholder": "Задайте вопрос по данным...",
    "dashboard.chat.send": "Отправить",
    "dashboard.chat.typing": "ИИ думает...",
    "dashboard.export.pdf": "Экспорт PDF",
    "dashboard.export.excel": "Экспорт Excel",
    "excel.transaction_id": "ID Транзакции",
    "excel.customer_name": "Имя Клиента",
    "excel.total_spent_usd": "Общие затраты (USD)",
    "excel.purchase_frequency": "Частота покупок",
    "excel.days_since_last_purchase": "Дней с последней покупки",
    "excel.cluster": "Кластер",

    "chart.cluster": "Кластер",
    "chart.group": "Группа",
    "chart.pca1": "Ось похожести A",
    "chart.pca2": "Ось похожести B",
    "chart.tooltipPoint": "Точка",
    "dashboard.insights.title": "Практические инсайты",
    "dashboard.insights.subtitle": "Рекомендованные действия по текущей сегментации",
    "dashboard.drilldown.title": "Детализация по группам",
    "dashboard.drilldown.subtitle": "Просмотрите клиентов внутри выбранной группы",
    "dashboard.drilldown.allGroups": "Все группы",
    "dashboard.drilldown.empty": "Для выбранного фильтра данных нет.",
    "dashboard.drilldown.col.name": "Клиент",
    "dashboard.drilldown.col.id": "ID транзакции",
    "dashboard.drilldown.col.spend": "Траты (USD)",
    "dashboard.drilldown.col.freq": "Частота покупок",
    "dashboard.drilldown.col.recency": "Дней с последней покупки",
    "dashboard.drilldown.col.group": "Группа",
    "dashboard.drilldown.searchPlaceholder": "Поиск по клиенту, ID или группе...",
    "dashboard.drilldown.prev": "Назад",
    "dashboard.drilldown.next": "Далее",
    "dashboard.drilldown.pageStatus": "Стр. {page}/{total} • строк: {count}",
    "dashboard.drilldown.exportCsv": "Экспорт отфильтрованного CSV",
  },
  uz: {
    "nav.aria": "Asosiy navigatsiya",
    "nav.brand": "AI-BI",
    "nav.home": "Bosh sahifa",
    "nav.dashboard": "Boshqaruv paneli",
    "nav.logout": "Chiqish",
    "nav.logoutConfirm": "Rostdan ham tizimdan chiqmoqchimisiz?",
    "lang.switch": "Til",

    heroBadge: "Kichik va oʻrta biznes uchun tahlil",
    heroTitle: "Sunʼiy intellekt asosidagi biznes tahlili platformasi",
    heroSubtitle:
      "Savdo maʼlumotlaringizni yuklang — konveyer ularni tozalaydi va tuzatadi, soʻng mijoz segmentlari va tezkor javob beradigan diagrammalarni oʻrganing.",
    goDashboard: "Boshqaruv paneliga oʻtish",
    platformSublead: "Segmentatsiya, PCA xaritalari va boshqaruv panellari — FastAPI backend bilan integratsiya.",
    feature1Title: "Toza maʼlumot konveyerlari",
    feature1Body: "CSV va Excel importi, maydonlarni standartlashtirish va sifatni bir oqimda koʻrib chiqish.",
    feature2Title: "ML segmentatsiyasi",
    feature2Body: "K-oʻrtacha klasterlari va PCA koordinatalari Recharts vizualizatsiyasi uchun tayyor.",
    feature3Title: "Egalar uchun interfeys",
    feature3Body: "Jamoa vaqti vositalarga emas, qarorlarga sarflansin — shunga qaratilgan ish maydoni.",

    "dashboard.workspace": "Ish maydoni",
    "dashboard.title": "Intellektual boshqaruv paneli",
    "dashboard.subtitle":
      "Savdo fayllarini yuklang, maʼlumot salomatligini baholang, soʻng mijoz segmentlarini ikki oʻlchamda aks ettirish uchun K-oʻrtacha + PCA ni ishga tushiring.",
    "dashboard.api": "API",
    "dashboard.errorTitle": "Soʻrov bajarilmadi",
    "dashboard.errorNoUpload": "Segmentatsiya uchun avval maʼlumotlar toʻplamini yuklang.",
    "dashboard.errorAxiosMessage": "Soʻrov bajarilmadi",
    "dashboard.errorUnknown": "Nomaʼlum xatolik yuz berdi",
    "dashboard.uploadTitle": "Maʼlumot yuklash",
    "dashboard.uploadBody.before": "CSV yoki Excel fayllari",
    "dashboard.uploadBody.after": "uchun yuboriladi — maʼlumotlarni tozalash va EDA uchun.",
    "dashboard.uploading": "Yuklanmoqda…",
    uploadFile: "Faylni yuklash",
    "dashboard.running": "Bajarilmoqda…",
    "dashboard.runSegmentation": "AI segmentatsiyasini ishga tushirish",
    "dashboard.file": "Fayl",
    "dashboard.imputation": "Imputatsiya",
    "dashboard.previewRows": "Oldindan koʻrish qatorlari",
    "dashboard.previewHint":
      "Segmentatsiya API qaytargan barcha tozalangan qatorlardan foydalanadi.",
    "dashboard.stat.totalRows": "Jami qatorlar",
    "dashboard.stat.totalRowsHint": "Tozalangan toʻplam hajmi",
    "dashboard.stat.columns": "Ustunlar",
    "dashboard.stat.columnsHint": "Tozalashdan keyingi maydonlar",
    "dashboard.stat.missing": "Yetishmayotgan qiymatlar",
    "dashboard.stat.missingHint": "Tozalashdan keyin qolgan boʻshliqlar",
    "dashboard.stat.clusters": "Klasterlar (soʻnggi ishga tushirish)",
    "dashboard.stat.clustersHint": "Har xil K-oʻrtacha guruhlari",
    "dashboard.modelContext": "Model konteksti",
    "dashboard.featuresUsed": "Ishlatilgan alomatlar:",
    "dashboard.chartTitle": "Mijozlar o'xshashlik xaritasi",
    "dashboard.customerSegmentation": "Mijozlarni segmentlash",
    "dashboard.chartSubtitle":
      "Raqamli xarid signallarining ikki oʻlchamli embeddingi — nuqtalar klaster boʻyicha ranglangan.",
    "dashboard.chart.explain.title": "Xaritani qanday o'qish kerak",
    "dashboard.chart.explain.body":
      "PCA1 va PCA2 — bir nechta sonli belgidan hosil qilingan nisbiy o'qlar. 0 markazni bildiradi, +/- esa faqat yo'nalish (yaxshi yoki yomon emas). Bir-biriga yaqin nuqtalar o'xshash mijozlar, uzoq nuqtalar esa xulqi ancha farqli mijozlardir.",
    "dashboard.emptyChartTitle": "Segmentatsiya diagrammasi hali yoʻq",
    "dashboard.emptyChartBefore": "Maʼlumotlar toʻplamini yuklang, soʻng",
    "dashboard.emptyChartAfter": "bosib, API javobidan PCA koordinatalarini chizing.",
    "dashboard.chartLoading": "Diagramma yuklanmoqda…",
    "dashboard.clusterInsights.title": "Klaster Tahlillari",
    "dashboard.clusterInsights.subtitle": "Mijozlar segmentlarini AI tahlili",
    "dashboard.clusterInsights.clusterPrefix": "Klaster",
    "dashboard.clusterInsights.customerCount": "mijoz",
    "dashboard.clusterInsights.empty":
      "Klaster talqinlarini ko‘rish uchun segmentatsiyani ishga tushiring.",
    "dashboard.clusterInsights.label.average": "O'rtacha mijozlar",
    "dashboard.clusterInsights.label.vip": "VIP / Yuqori daromadli",
    "dashboard.clusterInsights.label.risk": "Xavf ostida / Ketib qolish ehtimoli",
    "dashboard.clusterInsights.label.custom": "Qo‘shimcha segment",
    "dashboard.kpi.total_revenue": "Umumiy Daromad",
    "dashboard.kpi.total_customers": "Jami Mijozlar",
    "dashboard.kpi.risk_revenue": "Xavf Ostidagi Daromad",
    "dashboard.kpi.avg_per_customer": "Bir mijozga o'rtacha",
    "dashboard.kpi.active_clusters": "Faol klasterlar",
    "dashboard.kpi.risk_share": "Xavf ulushi",
    "dashboard.chart.donut_title": "Daromad Taqsimoti",
    "dashboard.forecast.title": "Savdoni prognoz qilish (AI)",
    "dashboard.forecast.subtitle": "Tarixiy ma'lumotlar asosida 30 kunlik kelajak prognozi",
    "dashboard.forecast.disclaimer":
      "Prognoz tarixiy ma'lumotlarga asoslangan taxmin bo'lib, 100% aniq bo'lmasligi mumkin.",
    "dashboard.forecast.generate30": "30 kunlik prognozni ishga tushirish",
    "dashboard.forecast.loading": "Prognoz yaratilmoqda…",
    "dashboard.forecast.using": "Ishlatilgan ustunlar",
    "dashboard.forecast.actual": "Tarixiy savdo",
    "dashboard.forecast.predicted": "Prognoz savdo",
    "dashboard.forecast.empty": "Prognozni yaratish uchun yuqoridagi tugmani bosing",
    "dashboard.forecast.errorInferColumns":
      "Sana va savdo ustunlari aniqlanmadi. Toʻplamda sana maydoni va sonli savdo ustuni borligiga ishonch hosil qiling.",
    "dashboard.chat.title": "AI Biznes Maslahatchi",
    "dashboard.chat.quickTitle": "Tez savollar",
    "dashboard.chat.quick.vip": "VIP mijozlarim kimlar?",
    "dashboard.chat.quick.risk": "Qaysi mijozlar xavf ostida?",
    "dashboard.chat.quick.forecast": "Keyingi 30 kun prognozini qisqacha ayt",
    "dashboard.chat.placeholder": "Ma'lumotlar bo'yicha savol bering (masalan: VIP mijozlarim kim?)...",
    "dashboard.chat.send": "Yuborish",
    "dashboard.chat.typing": "AI o'ylamoqda...",
    "dashboard.export.pdf": "PDF Hisobot",
    "dashboard.export.excel": "Excel Yuklash",
    "excel.transaction_id": "Tranzaksiya ID",
    "excel.customer_name": "Mijoz Ismi",
    "excel.total_spent_usd": "Jami Xarajat (USD)",
    "excel.purchase_frequency": "Xarid Chastotasi",
    "excel.days_since_last_purchase": "Oxirgi xariddan beri (kun)",
    "excel.cluster": "Klaster",

    "chart.cluster": "Klaster",
    "chart.group": "Guruh",
    "chart.pca1": "O'xshashlik o'qi A",
    "chart.pca2": "O'xshashlik o'qi B",
    "chart.tooltipPoint": "Nuqta",
    "dashboard.insights.title": "Amaliy tavsiyalar",
    "dashboard.insights.subtitle": "Joriy segmentatsiyaga asoslangan keyingi qadamlar",
    "dashboard.drilldown.title": "Guruh bo'yicha tafsilot",
    "dashboard.drilldown.subtitle": "Tanlangan guruh ichidagi mijozlarni ko'ring",
    "dashboard.drilldown.allGroups": "Barcha guruhlar",
    "dashboard.drilldown.empty": "Tanlangan filtr bo'yicha qator topilmadi.",
    "dashboard.drilldown.col.name": "Mijoz",
    "dashboard.drilldown.col.id": "Tranzaksiya ID",
    "dashboard.drilldown.col.spend": "Xarajat (USD)",
    "dashboard.drilldown.col.freq": "Xarid soni",
    "dashboard.drilldown.col.recency": "Oxirgi xariddan beri (kun)",
    "dashboard.drilldown.col.group": "Guruh",
    "dashboard.drilldown.searchPlaceholder": "Mijoz, ID yoki guruh bo'yicha qidiring...",
    "dashboard.drilldown.prev": "Oldingi",
    "dashboard.drilldown.next": "Keyingi",
    "dashboard.drilldown.pageStatus": "Sahifa {page}/{total} • qatorlar: {count}",
    "dashboard.drilldown.exportCsv": "Filtrlangan CSV yuklab olish",
  },
};

type LanguageContextType = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "ai-bi-language";
const DEFAULT_LANGUAGE: LanguageCode = "en";

function normalizeLanguage(lang: string | null | undefined): LanguageCode {
  const normalized = (lang ?? "").trim().toLowerCase();
  if (normalized === "ru" || normalized === "uz" || normalized === "en") {
    return normalized;
  }
  return DEFAULT_LANGUAGE;
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(normalizeLanguage(lang));
  };

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setLanguageState(normalizeLanguage(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string) => dictionary[language]?.[key] ?? dictionary.en?.[key] ?? key;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};
