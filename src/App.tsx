import React, { useState, useEffect, useRef } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  Trash2,
  Edit2,
  Check,
  X,
  RotateCw,
  Image as ImageIcon,
  FileText,
  RotateCcw,
  CheckCircle2,
  BookOpen,
  Info,
  Eye,
  EyeOff,
  Database,
  Download,
  Upload
} from "lucide-react";

// دالة للحصول على اسم المجلد الافتراضي من مسار الصفحة الحالي
const getFolderName = (): string => {
  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && (lastSegment.endsWith(".html") || lastSegment.endsWith(".htm"))) {
    segments.pop();
  }
  const folder = segments[0] || "Quran";
  return folder.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF\s]/g, "").trim();
};

// واجهة بيانات صف القارئ الواحد
interface ReaderRow {
  juz: number;         // رقم الجزء (1-30)
  readerName: string;  // اسم المشارك
  isDone: boolean;     // حالة الإنجاز (تم القراءة أم لا)
  warning1: boolean;   // الإنذار الأول (برتقالي)
  warning2: boolean;   // الإنذار الثاني (أخضر)
  warning3: boolean;   // الإنذار الثالث (أحمر)
}

// واجهة حالة صندوق التأكيد المنبثق
interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: "warning" | "danger" | "info" | "success";
}

// قائمة الأسماء الافتراضية المستوحاة من الصورة المرفقة لتسهيل التشغيل الأولي
const DEFAULT_READERS_LIST = [
  "أمجد تاريخ",
  "فاضل فتر",
  "حسين علي سعيد",
  "محمد غازي درويش",
  "جعفر فتر",
  "محمد كويتان",
  "محمد الغانمي",
  "علي مسلم هلال",
  "حسين رياض",
  "علي ناجي",
  "سيد عبدالله علوي",
  "سيد حسين علوي",
  "حسين الحواج",
  "علي هاني الميرزا",
  "سيد إبراهيم مدن",
  "سجاد الزاكي",
  "سامي ياسين",
  "محمد عمران",
  "حسين المدحوب",
  "أحمد يونس",
  "محمد عبدالله المسجن",
  "مصطفى جلال",
  "عبدالله المحاري",
  "منتظر حسن نوح",
  "أحمد هاني الميرزا",
  "علي الساري",
  "أحمد ياسر",
  "حسين السماهيجي",
  "أمجد الزاكي",
  "حسن معيوف"
];

// الملاحظات الافتراضية
const DEFAULT_NOTES = `ملاحظات:-
1. لكل شخص منا ثلاثة إنذارات، ومن بعدها يتم الطرد...
2. في حال ما لم تستطع الإنتهاء من الجزء قبل نهاية الشهر، "الكتابة في القروب خير مثال."
3. هناك ثلاثة ألوان: البرتقالي = الإنذار الأول // الأخضر = الإنذار الثاني // الأحمر = الإنذار الثالث`;

// أسماء الأشهر العربية
const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

export default function App() {
  // --- تحديد المجلد الافتراضي واسم قاعدة البيانات النشطة ---
  const defaultFolder = getFolderName();
  const activeDbKey = "khatma_active_db_" + defaultFolder;

  const [dbName, setDbName] = useState<string>(() => {
    const saved = localStorage.getItem(activeDbKey);
    return saved ? saved.trim() : defaultFolder;
  });

  // --- حالة التطبيق الأساسية (State) ---
  const [monthIndex, setMonthIndex] = useState<number>(6); // افتراضي يونيو (6)
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [isGateUnlocked, setIsGateUnlocked] = useState<boolean>(false);
  const [showWarningsColumn, setShowWarningsColumn] = useState<boolean>(true);

  // حالة التحكم بقاعدة البيانات واللوحة Collapsible
  const [showDbPanel, setShowDbPanel] = useState<boolean>(false);
  const [dbNameInput, setDbNameInput] = useState<string>("");

  // حالة التحكم في التعديل الفوري للأسماء
  const [editingJuz, setEditingJuz] = useState<number | null>(null);
  const [editNameInput, setEditNameInput] = useState<string>("");

  // مراجع للطباعة والتصدير والتنبيهات
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [alertMsg, setAlertMsg] = useState<{ text: string; type: "success" | "info" | "warning" } | null>(null);

  // حالة صندوق التأكيد المنبثق
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { },
  });

  // دالة إظهار صندوق التأكيد المنبثق
  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    type: "warning" | "danger" | "info" | "success" = "warning",
    confirmText = "تأكيد",
    cancelText = "إلغاء"
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
      type,
      confirmText,
      cancelText,
    });
  };

  // تبديل أو تطبيق قاعدة البيانات النشطة
  const handleSwitchDb = (newDbName: string) => {
    const sanitized = newDbName.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF\s]/g, "").trim();
    if (!sanitized) {
      showAlert("اسم قاعدة البيانات غير صالح.", "warning");
      return;
    }
    localStorage.setItem(activeDbKey, sanitized);
    setDbName(sanitized);
    showAlert(`تم الانتقال إلى قاعدة البيانات: ${sanitized}`, "success");
  };

  // مزامنة حقل الإدخال عند تبديل قاعدة البيانات
  useEffect(() => {
    if (dbName) {
      setDbNameInput(dbName);
    }
  }, [dbName]);

  // --- التحميل الأولي والربط الذكي بقاعدة البيانات المختارة ---
  useEffect(() => {
    if (!dbName) return;

    const readersKey = `khatma_${dbName}_readers`;
    const monthKey = `khatma_${dbName}_monthIndex`;
    const notesKey = `khatma_${dbName}_notes`;
    const gateKey = `khatma_${dbName}_isGateUnlocked`;
    const warningsKey = `khatma_${dbName}_showWarningsColumn`;

    const savedReaders = localStorage.getItem(readersKey);
    const savedMonth = localStorage.getItem(monthKey);
    const savedNotes = localStorage.getItem(notesKey);
    const savedGate = localStorage.getItem(gateKey);
    const savedShowWarnings = localStorage.getItem(warningsKey);

    // هجرة البيانات القديمة غير المفصلة (إذا كانت موجودة ولم ننشئ بيانات محددة بعد)
    const oldReaders = localStorage.getItem("khatma_readers");
    const oldMonth = localStorage.getItem("khatma_monthIndex");
    const oldNotes = localStorage.getItem("khatma_notes");
    const oldGate = localStorage.getItem("khatma_isGateUnlocked");
    const oldShowWarnings = localStorage.getItem("khatma_showWarningsColumn");

    let finalReaders: ReaderRow[];
    let finalMonth: number;
    let finalNotes: string;
    let finalGate: boolean;
    let finalShowWarnings: boolean;

    if (!savedReaders && oldReaders) {
      finalReaders = JSON.parse(oldReaders);
      finalMonth = oldMonth ? parseInt(oldMonth, 10) : 6;
      finalNotes = oldNotes !== null ? oldNotes : DEFAULT_NOTES;
      finalGate = oldGate === "true";
      finalShowWarnings = oldShowWarnings !== null ? oldShowWarnings === "true" : true;

      // حفظها للمفتاح الجديد
      localStorage.setItem(readersKey, JSON.stringify(finalReaders));
      localStorage.setItem(monthKey, finalMonth.toString());
      localStorage.setItem(notesKey, finalNotes);
      localStorage.setItem(gateKey, finalGate.toString());
      localStorage.setItem(warningsKey, finalShowWarnings.toString());

      showAlert(`تم نقل بياناتك السابقة تلقائياً لقاعدة المجلد الحالية (${dbName}).`, "success");
    } else {
      if (savedReaders) {
        finalReaders = JSON.parse(savedReaders);
      } else {
        const initialRows: ReaderRow[] = Array.from({ length: 30 }, (_, i) => ({
          juz: i + 1,
          readerName: DEFAULT_READERS_LIST[i] || "",
          isDone: false,
          warning1: false,
          warning2: false,
          warning3: false,
        }));
        finalReaders = initialRows;
        localStorage.setItem(readersKey, JSON.stringify(initialRows));
      }

      if (savedMonth) {
        finalMonth = parseInt(savedMonth, 10);
      } else {
        finalMonth = 6;
        localStorage.setItem(monthKey, "6");
      }

      if (savedNotes !== null) {
        finalNotes = savedNotes;
      } else {
        finalNotes = DEFAULT_NOTES;
        localStorage.setItem(notesKey, DEFAULT_NOTES);
      }

      finalGate = savedGate === "true";
      finalShowWarnings = savedShowWarnings !== null ? savedShowWarnings === "true" : true;
    }

    setReaders(finalReaders);
    setMonthIndex(finalMonth);
    setNotes(finalNotes);
    setIsGateUnlocked(finalGate);
    setShowWarningsColumn(finalShowWarnings);
  }, [dbName]);

  // --- حفظ التغييرات تلقائياً في localStorage ---
  const saveToLocalStorage = (
    updatedReaders: ReaderRow[],
    updatedMonth: number,
    updatedNotes: string,
    updatedGate: boolean,
    targetDb = dbName
  ) => {
    if (!targetDb) return;
    localStorage.setItem(`khatma_${targetDb}_readers`, JSON.stringify(updatedReaders));
    localStorage.setItem(`khatma_${targetDb}_monthIndex`, updatedMonth.toString());
    localStorage.setItem(`khatma_${targetDb}_notes`, updatedNotes);
    localStorage.setItem(`khatma_${targetDb}_isGateUnlocked`, updatedGate.toString());
  };

  // تصدير واستيراد البيانات كملفات JSON
  const handleExportJSON = () => {
    const data = {
      dbName,
      monthIndex,
      readers,
      notes,
      isGateUnlocked,
      showWarningsColumn
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(data, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `quran_db_${dbName}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showAlert("تم تصدير ملف نسخة قاعدة البيانات بنجاح!", "success");
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;

    fileReader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (
          importedData &&
          Array.isArray(importedData.readers) &&
          typeof importedData.monthIndex === "number"
        ) {
          showConfirm(
            "تأكيد استيراد البيانات",
            `هل ترغب حقاً في استيراد البيانات؟ هذا سيقوم باستبدال البيانات الحالية في (${dbName}) ببيانات الملف المستورد.`,
            () => {
              setReaders(importedData.readers);
              setMonthIndex(importedData.monthIndex);
              if (importedData.notes !== undefined) setNotes(importedData.notes);
              if (importedData.isGateUnlocked !== undefined) setIsGateUnlocked(importedData.isGateUnlocked);
              if (importedData.showWarningsColumn !== undefined) setShowWarningsColumn(importedData.showWarningsColumn);

              saveToLocalStorage(
                importedData.readers,
                importedData.monthIndex,
                importedData.notes || "",
                importedData.isGateUnlocked || false,
                dbName
              );
              localStorage.setItem(`khatma_${dbName}_showWarningsColumn`, (importedData.showWarningsColumn ?? true).toString());
              showAlert("تم استيراد قاعدة البيانات وتطبيقها بنجاح!", "success");
            },
            "warning",
            "استيراد الآن"
          );
        } else {
          showAlert("محتوى ملف JSON غير مطابق للمواصفات المطلوبة.", "warning");
        }
      } catch (err) {
        showAlert("فشل في قراءة وتحليل ملف JSON.", "warning");
      }
    };
    fileReader.readAsText(file);
    e.target.value = "";
  };

  // المساعدة في عرض رسائل التنبيه المؤقتة
  const showAlert = (text: string, type: "success" | "info" | "warning" = "success") => {
    setAlertMsg({ text, type });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  // الحصول على اسم الشهر العربي الفعلي
  const getArabicMonthName = (idx: number) => {
    return ARABIC_MONTHS[(idx - 1 + 12) % 12];
  };

  // تبديل إظهار/إخفاء عمود الإنذارات
  const toggleWarningsVisibility = () => {
    const newValue = !showWarningsColumn;
    setShowWarningsColumn(newValue);
    localStorage.setItem(`khatma_${dbName}_showWarningsColumn`, newValue.toString());
    showAlert(newValue ? "تم إظهار عمود الإنذارات." : "تم إخفاء عمود الإنذارات لتسهيل التصفح.", "info");
  };

  // --- العمليات (Actions & Handlers) ---

  // 1. تبديل حالة الإنجاز (تم القراءة)
  const toggleDone = (juz: number) => {
    const updated = readers.map((r) =>
      r.juz === juz ? { ...r, isDone: !r.isDone } : r
    );
    setReaders(updated);
    saveToLocalStorage(updated, monthIndex, notes, isGateUnlocked);
    showAlert(`تم تحديث حالة الجزء (${juz}) بنجاح.`, "info");
  };

  // 2. تفعيل الإنذارات بشكل مستقل
  const toggleWarning = (juz: number, warningNum: 1 | 2 | 3) => {
    const updated = readers.map((r) => {
      if (r.juz === juz) {
        if (warningNum === 1) return { ...r, warning1: !r.warning1 };
        if (warningNum === 2) return { ...r, warning2: !r.warning2 };
        if (warningNum === 3) return { ...r, warning3: !r.warning3 };
      }
      return r;
    });
    setReaders(updated);
    saveToLocalStorage(updated, monthIndex, notes, isGateUnlocked);
    showAlert(`تم تعديل الإنذارات للجزء (${juz}).`, "info");
  };

  // 3. بدء وضع تعديل الاسم
  const startEditing = (juz: number, currentName: string) => {
    setEditingJuz(juz);
    setEditNameInput(currentName);
  };

  // 4. حفظ الاسم بعد التعديل
  const handleSaveName = (juz: number) => {
    const updated = readers.map((r) =>
      r.juz === juz ? { ...r, readerName: editNameInput.trim() } : r
    );
    setReaders(updated);
    setEditingJuz(null);
    saveToLocalStorage(updated, monthIndex, notes, isGateUnlocked);
    showAlert(`تم تعديل اسم المشارك في الجزء (${juz}).`, "success");
  };

  // 5. حذف قارئ من جزء معين
  const handleDeleteReader = (juz: number) => {
    showConfirm(
      "إلغاء تعيين القارئ",
      `هل أنت متأكد من حذف القارئ من الجزء (${juz})؟ سيتم تصفير حالة هذا الجزء وإلغاء جميع الإنذارات الخاصة به.`,
      () => {
        const updated = readers.map((r) =>
          r.juz === juz
            ? {
              ...r,
              readerName: "",
              isDone: false,
              warning1: false,
              warning2: false,
              warning3: false,
            }
            : r
        );
        setReaders(updated);
        saveToLocalStorage(updated, monthIndex, notes, isGateUnlocked);
        showAlert(`تم حذف القارئ وتصفير حالة الجزء (${juz}).`, "warning");
      },
      "danger"
    );
  };

  // 6. تعديل الملاحظات
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    saveToLocalStorage(readers, monthIndex, val, isGateUnlocked);
  };

  // 7. إنهاء الختمة (بوابة فك قفل التدوير)
  const handleFinishKhatma = () => {
    const doneCount = readers.filter((r) => r.isDone).length;

    const proceedFinish = () => {
      setIsGateUnlocked(true);
      saveToLocalStorage(readers, monthIndex, notes, true);
      showAlert("تم إغلاق الختمة الحالية بنجاح! تم فك قفل تدوير الأدوار للشهر الجديد.", "success");
    };

    if (doneCount < 30) {
      showConfirm(
        "إنهاء ختمة غير مكتملة",
        `تنبيه: تم قراءة ${doneCount} جزءاً فقط من أصل 30. هل ترغب في إنهاء الختمة بالرغم من عدم اكتمالها لتفعيل خيار تدوير الشهر الجديد؟`,
        proceedFinish,
        "warning",
        "إنهاء الختمة"
      );
    } else {
      showConfirm(
        "تأكيد إنهاء الختمة",
        "هل ترغب في إنهاء الختمة الحالية وتفعيل خيار التدوير للشهر الجديد؟",
        proceedFinish,
        "success",
        "إنهاء وتفعيل التدوير"
      );
    }
  };

  // 8. تدوير الأدوار تلقائياً
  const handleRotateMonth = () => {
    if (!isGateUnlocked) return;

    showConfirm(
      "تدوير الأدوار للشهر الجديد",
      "هل أنت متأكد من الانتقال للشهر الجديد وتدوير أدوار القراءة؟ سينتقل كل مشارك إلى الجزء التالي (مثال: من 1 إلى 2، ومن 30 إلى 1)، وسيتم تصفير الإنذارات وحالات القراءة.",
      () => {
        // منطق التدوير: newReader[k] = oldReader[(k - 1 + 30) % 30]
        const rotatedReaders = readers.map((row, index) => {
          const prevIndex = (index - 1 + 30) % 30;
          const prevReader = readers[prevIndex];
          return {
            juz: row.juz,
            readerName: prevReader.readerName,
            isDone: false,
            warning1: false,
            warning2: false,
            warning3: false,
          };
        });

        const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1;

        setReaders(rotatedReaders);
        setMonthIndex(nextMonth);
        setIsGateUnlocked(false);

        saveToLocalStorage(rotatedReaders, nextMonth, notes, false);
        showAlert(`تم تدوير الأدوار والبدء في شهر ${getArabicMonthName(nextMonth)} (${nextMonth}) بنجاح!`, "success");
      },
      "success",
      "تدوير الأدوار الآن"
    );
  };

  // 9. تصفير الختمة بالكامل لبدء إدخال جديد
  const handleResetAll = () => {
    showConfirm(
      "تصفير الجدول بالكامل",
      "تحذير: هل ترغب حقاً في تصفير جميع أسماء المشاركين والإنذارات وحالات الإنجاز؟ هذا سيقوم بحذف كل البيانات المسجلة والبدء من الصفر تماماً ولا يمكن التراجع عن هذا الإجراء.",
      () => {
        const emptyRows = Array.from({ length: 30 }, (_, i) => ({
          juz: i + 1,
          readerName: "",
          isDone: false,
          warning1: false,
          warning2: false,
          warning3: false,
        }));
        setReaders(emptyRows);
        setIsGateUnlocked(false);
        saveToLocalStorage(emptyRows, monthIndex, notes, false);
        showAlert("تم تصفير الجدول وإفراغ جميع أسماء المشاركين.", "warning");
      },
      "danger",
      "تصفير البيانات"
    );
  };

  // 10. إرجاع الأسماء الافتراضية
  const handleRestoreDefaultList = () => {
    showConfirm(
      "استعادة القائمة الافتراضية",
      "هل ترغب في إعادة تحميل قائمة المشاركين الافتراضية؟.",
      () => {
        const defaultRows = Array.from({ length: 30 }, (_, i) => ({
          juz: i + 1,
          readerName: DEFAULT_READERS_LIST[i] || "",
          isDone: false,
          warning1: false,
          warning2: false,
          warning3: false,
        }));
        setReaders(defaultRows);
        setIsGateUnlocked(false);
        saveToLocalStorage(defaultRows, monthIndex, notes, false);
        showAlert("تم استرجاع قائمة الأسماء الافتراضية بنجاح.", "success");
      },
      "info",
      "استعادة القائمة"
    );
  };

  // --- تصدير الصورة والـ PDF ---

  const handleExportPNG = async () => {
    if (!printAreaRef.current) return;
    setExporting(true);
    showAlert("جاري إعداد صورة PNG بجودة عالية... يرجى الانتظار", "info");

    // حفظ أبعاد التنسيق الأصلية للجهاز اللوحي أو الهاتف
    const originalWidth = printAreaRef.current.style.width;
    const originalMaxWidth = printAreaRef.current.style.maxWidth;

    try {
      // فرض عرض مكتبي ثابت بشكل مؤقت أثناء التوليد لتفادي قص أي عمود
      printAreaRef.current.style.width = "1024px";
      printAreaRef.current.style.maxWidth = "none";
      
      // ننتظر برهة صغيرة لكي يعيد المتصفح رسم الصفحة بالأبعاد الجديدة
      await new Promise((resolve) => setTimeout(resolve, 100));

      // إخفاء التأثيرات وحفظ اتساق الألوان للغة العربية بدون تقطيع عبر html-to-image
      const dataUrl = await toPng(printAreaRef.current, {
        quality: 0.98,
        pixelRatio: 2, // جودة عالية
        backgroundColor: "#ffffff",
        style: {
          borderRadius: "0px",
          boxShadow: "none",
        }
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `جدول_ختمة_شهر_${getArabicMonthName(monthIndex)}_${monthIndex}.png`;
      link.click();
      showAlert("تم تصدير وحفظ الصورة بنجاح!", "success");
    } catch (err) {
      console.error("فشل التصدير كصورة:", err);
      showAlert("حدث خطأ أثناء تصدير الصورة.", "warning");
    } finally {
      // إعادة الأبعاد الأصلية للتجاوب فوراً
      if (printAreaRef.current) {
        printAreaRef.current.style.width = originalWidth;
        printAreaRef.current.style.maxWidth = originalMaxWidth;
      }
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!printAreaRef.current) return;
    setExporting(true);
    showAlert("جاري إنشاء ملف PDF التفاعلي... يرجى الانتظار", "info");

    // حفظ أبعاد التنسيق الأصلية للجهاز اللوحي أو الهاتف
    const originalWidth = printAreaRef.current.style.width;
    const originalMaxWidth = printAreaRef.current.style.maxWidth;

    try {
      // فرض عرض مكتبي ثابت بشكل مؤقت أثناء التوليد لتفادي قص أي عمود
      printAreaRef.current.style.width = "1024px";
      printAreaRef.current.style.maxWidth = "none";
      
      // ننتظر برهة صغيرة لكي يعيد المتصفح رسم الصفحة بالأبعاد الجديدة
      await new Promise((resolve) => setTimeout(resolve, 100));

      const dataUrl = await toPng(printAreaRef.current, {
        quality: 0.98,
        pixelRatio: 2, // دقة عالية
        backgroundColor: "#ffffff",
        style: {
          borderRadius: "0px",
          boxShadow: "none",
        }
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const imgWidth = 210; // عرض A4 بالـ مليمتر
      const pageHeight = 297; // ارتفاع A4 بالـ مليمتر

      // تحميل الصورة مؤقتاً لحساب أبعاد الارتفاع الصحيحة
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const imgHeight = (img.naturalHeight * imgWidth) / img.naturalWidth;
      let heightLeft = imgHeight;
      let position = 0;

      // الصفحة الأولى
      pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;

      // التعامل مع الصفحات المتعددة إن وجدت
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= pageHeight;
      }

      pdf.save(`جدول_ختمة_شهر_${getArabicMonthName(monthIndex)}_${monthIndex}.pdf`);
      showAlert("تم تصدير وحفظ مستند PDF بنجاح!", "success");
    } catch (err) {
      console.error("فشل التصدير كـ PDF:", err);
      showAlert("حدث خطأ أثناء تصدير ملف PDF.", "warning");
    } finally {
      // إعادة الأبعاد الأصلية للتجاوب فوراً
      if (printAreaRef.current) {
        printAreaRef.current.style.width = originalWidth;
        printAreaRef.current.style.maxWidth = originalMaxWidth;
      }
      setExporting(false);
    }
  };

  // عداد الأجزاء المنجزة
  const completedCount = readers.filter((r) => r.isDone).length;
  const progressPercent = Math.round((completedCount / 30) * 100);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 select-none">

      {/* --- شريط التنبيهات العلوي --- */}
      {alertMsg && (
        <div
          className={`fixed top-5 left-5 z-50 px-5 py-3 rounded-xl shadow-lg border text-sm flex items-center gap-2 animate-bounce transition-all ${alertMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : alertMsg.type === "warning"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
        >
          <span className="font-bold">✓</span>
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* --- لوحة تحكم الإدارة العلوية (غير قابلة للتصدير) --- */}
      <div
        data-html2canvas-ignore="true"
        className="mb-8 p-4 sm:p-6 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4"
      >
        <div className="flex flex-col gap-1 items-center md:items-start text-center md:text-right">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h2 className="text-xl font-bold text-slate-800 font-sans">
              لوحة التحكم والمتابعة للختمة
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            يمكنك إدخال الأسماء، تحديث حالة الإنجاز، وإدارة الإنذارات. ثم تدوير الأدوار للشهر التالي عند اكتمال الختمة.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {/* تغيير الشهر يدوياً */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 text-sm">
            <span className="px-3 text-slate-600 font-medium text-xs">الشهر:</span>
            <select
              value={monthIndex}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setMonthIndex(val);
                saveToLocalStorage(readers, val, notes, isGateUnlocked);
                showAlert(`تم تغيير الشهر يدوياً إلى ${getArabicMonthName(val)}`, "info");
              }}
              className="bg-white border-0 text-slate-700 text-xs rounded-lg px-2 py-1 font-bold focus:ring-0 focus:outline-none"
            >
              {ARABIC_MONTHS.map((m, idx) => (
                <option key={idx} value={idx + 1}>
                  {m} ({idx + 1})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRestoreDefaultList}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-100 rounded-xl text-xs font-semibold transition-all"
            title="استرجاع الأسماء الافتراضية المأخوذة من الجدول"
          >
            <RotateCcw size={14} />
            إعادة تعيين القائمة المرفقة
          </button>

          {/* زر عرض/إخفاء عمود الإنذارات */}
          <button
            onClick={toggleWarningsVisibility}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              showWarningsColumn
                ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
            title="إخفاء أو إظهار عمود الإنذارات لتسهيل الاستخدام على الشاشات الصغيرة"
          >
            {showWarningsColumn ? <EyeOff size={14} /> : <Eye size={14} />}
            {showWarningsColumn ? "إخفاء الإنذارات" : "إظهار الإنذارات"}
          </button>

          {/* زر إدارة قاعدة البيانات */}
          <button
            onClick={() => setShowDbPanel(!showDbPanel)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              showDbPanel
                ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
            title="إدارة قواعد البيانات وتصدير/استيراد ملفات التخزين"
          >
            <Database size={14} />
            <span>إدارة التخزين</span>
          </button>

          <button
            onClick={handleResetAll}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded-xl text-xs font-semibold transition-all"
          >
            <Trash2 size={14} />
            تصفير الأسماء
          </button>
        </div>
      </div>

      {/* --- لوحة إدارة التخزين وقواعد البيانات (Collapsible Panel) --- */}
      {showDbPanel && (
        <div
          data-html2canvas-ignore="true"
          className="mb-8 p-6 bg-white/80 backdrop-blur-md rounded-3xl border border-teal-100/50 shadow-md shadow-teal-900/5 text-right transition-all animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-2 text-teal-800 font-bold">
              <Database size={18} />
              <h3 className="text-sm font-bold">إدارة قاعدة البيانات والتخزين المحلي</h3>
            </div>
            <button
              onClick={() => setShowDbPanel(false)}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* جزء تعديل اسم قاعدة البيانات والتبديل */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-500">اسم قاعدة البيانات النشطة (مساحة التخزين):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dbNameInput}
                  onChange={(e) => setDbNameInput(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs text-slate-700"
                  placeholder="مثال: QuranG1, GroupA..."
                />
                <button
                  onClick={() => handleSwitchDb(dbNameInput)}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-slate-900 font-bold text-xs rounded-xl transition-all"
                >
                  تطبيق / تبديل
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                * يمكنك كتابة اسم جديد لإنشاء قاعدة بيانات فارغة لهذا المجلد. 
                اسم المجلد الافتراضي المكتشف: <span className="font-bold text-slate-600 font-mono">{defaultFolder}</span>
              </p>
            </div>

            {/* جزء استيراد وتصدير الملفات */}
            <div className="flex flex-col justify-end gap-3">
              <label className="text-xs font-bold text-slate-500">النسخ الاحتياطي وحفظ الملفات في المجلد الحالي:</label>
              <div className="flex flex-wrap gap-2">
                {/* زر التصدير */}
                <button
                  onClick={handleExportJSON}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-all"
                  title="تحميل قاعدة البيانات الحالية كملف JSON لحفظه في المجلد"
                >
                  <Download size={14} className="text-teal-600" />
                  تصدير كملف JSON
                </button>

                {/* زر الاستيراد */}
                <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-all">
                  <Upload size={14} className="text-sky-600" />
                  <span>استيراد ملف JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJSON}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                * يمكنك نسخ ملف JSON الناتج وحفظه في مجلد المشروع الخاص بك كملف قاعدة بيانات حقيقي!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* --- منطقة التصدير والطباعة (التي تظهر بالكامل بالـ PNG و PDF) --- */}
      <div
        ref={printAreaRef}
        id="capture-area"
        className="bg-white p-3 sm:p-6 md:p-8 rounded-3xl border border-teal-100/50 shadow-xl shadow-teal-900/5 transition-all relative overflow-hidden"
      >
        {/* خلفية جمالية خفيفة للتصدير */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50/30 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-50/20 rounded-full blur-3xl -z-10"></div>

        {/* 1. ترويسة العنوان المصمم (شبيه بالشريط Ribbon المرفق) */}
        <div className="flex flex-col items-center mb-8 relative">
          <div className="relative inline-block px-6 sm:px-12 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-100 via-teal-100 to-emerald-100 text-teal-800 font-bold rounded-2xl shadow-sm border border-emerald-200">
            {/* أجنحة الشريط يميناً ويساراً (أستايل Ribbon حديث وبسيط) */}
            <div className="hidden lg:block absolute top-1/2 -right-4 -translate-y-1/2 w-4 h-6 bg-emerald-200 border-y border-r border-emerald-300 rounded-r-lg"></div>
            <div className="hidden lg:block absolute top-1/2 -left-4 -translate-y-1/2 w-4 h-6 bg-emerald-200 border-y border-l border-emerald-300 rounded-l-lg"></div>

            <h1 className="text-xl md:text-2xl font-black font-sans tracking-wide text-center flex items-center gap-2 justify-center">
              <BookOpen className="text-emerald-700" size={24} />
              أجزاء شهر {getArabicMonthName(monthIndex)} ({monthIndex})
            </h1>
          </div>

          <div className="mt-3 flex items-center gap-2 text-slate-400 text-xs">
            <span>ختمة جماعية مباركة</span>
            <span>•</span>
            <span>نسبة الإنجاز: {progressPercent}% ({completedCount} جزء)</span>
          </div>
        </div>

        {/* 2. شريط التقدم المرئي */}
        <div className="w-full max-w-md mx-auto mb-8 bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
          <div
            className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-150 no-scrollbar">
          <table className="w-full min-w-[550px] border-collapse text-right text-slate-700">
            <thead>
              <tr className="bg-gradient-to-r from-sky-500 to-teal-600 text-white font-bold text-sm">
                <th className="py-4 px-2 text-center w-14 border-l border-white/10 rounded-tr-lg">الجزء</th>
                <th className="py-4 px-4 border-l border-white/10">اسم المشارك / القارئ</th>
                <th className={`py-4 px-3 text-center w-28 border-l border-white/10 ${!showWarningsColumn ? "rounded-tl-lg" : ""}`}>الحالة</th>
                <th className={`py-4 px-3 text-center w-24 border-l border-white/10 ${!showWarningsColumn ? "rounded-tl-lg" : ""}`} data-html2canvas-ignore="true">حالة الإنجاز</th>
                {showWarningsColumn && (
                  <th className="py-4 px-4 text-center w-40 rounded-tl-lg">الإنذارات</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readers.map((row) => {
                const hasReader = row.readerName.trim().length > 0;

                // تحديد تنسيق خلفية خلية الاسم
                let nameBgClass = "bg-white text-slate-700";
                if (row.warning3) {
                  // الإنذار الثالث = أحمر داكن
                  nameBgClass = "bg-rose-500 text-white font-bold";
                } else if (row.isDone) {
                  // تم القراءة = أصفر باستيل (مثل المرفق)
                  nameBgClass = "bg-amber-300 text-slate-900 font-semibold shadow-inner";
                }

                // تحديد تنسيق خلية رقم الجزء (الإنذار الأول = برتقالي، الإنذار الثاني = أخضر)
                let juzBgClass = "bg-slate-50 text-slate-700 font-bold";
                if (row.warning1) {
                  juzBgClass = "bg-orange-500 text-white font-black";
                } else if (row.warning2) {
                  juzBgClass = "bg-emerald-600 text-white font-black";
                }

                return (
                  <tr
                    key={row.juz}
                    className={`hover:bg-slate-50/80 transition-colors ${row.isDone ? "bg-amber-50/20" : ""
                      }`}
                  >
                    {/* عمود رقم الجزء */}
                    <td className={`py-3 px-3 text-center border-l border-slate-100 transition-all duration-300 ${juzBgClass}`}>
                      <div className="flex items-center justify-center min-h-[32px]">
                        {row.juz}
                      </div>
                    </td>

                    {/* عمود اسم المشارك */}
                    <td className={`py-2 px-4 border-l border-slate-100 transition-all duration-300 ${nameBgClass}`}>
                      {editingJuz === row.juz ? (
                        <div className="flex items-center gap-1" data-html2canvas-ignore="true">
                          <input
                            type="text"
                            value={editNameInput}
                            onChange={(e) => setEditNameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveName(row.juz);
                              if (e.key === "Escape") setEditingJuz(null);
                            }}
                            className="w-full px-2 py-1 text-slate-800 border border-teal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                            placeholder="اكتب اسم القارئ..."
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveName(row.juz)}
                            className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingJuz(null)}
                            className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group min-h-[36px]">
                          <span className="text-sm tracking-wide">
                            {row.readerName ? (
                              row.readerName
                            ) : (
                              <span className="text-slate-400/70 italic text-xs">
                                — لا يوجد قارئ معين —
                              </span>
                            )}
                          </span>

                           {/* أيقونات التعديل والحذف الفورية عند تمرير الماوس (تظهر دائماً على شاشات اللمس) */}
                           <div
                             className="flex items-center gap-1 transition-opacity opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                             data-html2canvas-ignore="true"
                           >
                            <button
                              onClick={() => startEditing(row.juz, row.readerName)}
                              className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="تعديل الاسم"
                            >
                              <Edit2 size={13} />
                            </button>
                            {hasReader && (
                              <button
                                onClick={() => handleDeleteReader(row.juz)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="إلغاء تعيين الاسم"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* عمود الحالة (لم يقرأ / تم القراءة) */}
                    <td className="py-2 px-3 text-center border-l border-slate-100">
                      <div className="flex items-center justify-center">
                        {row.isDone ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                            تم القراءة
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-400 text-xs rounded-full border border-slate-200">
                            لم يقرأ بعد
                          </span>
                        )}
                      </div>
                    </td>

                    {/* عمود زر القراءة (معطل في التصدير) */}
                    <td className="py-2 px-3 text-center border-l border-slate-100" data-html2canvas-ignore="true">
                      <button
                        onClick={() => hasReader && toggleDone(row.juz)}
                        disabled={!hasReader}
                        className={`w-20 py-1.5 rounded-lg text-xs font-bold transition-all ${!hasReader
                            ? "bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100"
                            : row.isDone
                              ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300"
                              : "bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200"
                          }`}
                      >
                        {row.isDone ? "تراجع" : "تم"}
                      </button>
                    </td>

                    {/* عمود إدارة الإنذارات (يتم إخلاؤه أو عرضه بناءً على خيار المشرف) */}
                    {showWarningsColumn && (
                      <td className="py-2 px-4 text-center">
                        <div className="flex flex-col lg:flex-row items-center justify-center gap-1.5">

                          {/* أزرار التحكم بالإنذارات تظهر للمشرف فقط وتختفي بالتصدير */}
                          <div
                            className="flex items-center gap-1"
                            data-html2canvas-ignore="true"
                          >
                            {/* إنذار 1 (برتقالي) */}
                            <button
                              onClick={() => hasReader && toggleWarning(row.juz, 1)}
                              disabled={!hasReader}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${!hasReader
                                  ? "bg-slate-50 text-slate-200 cursor-not-allowed"
                                  : row.warning1
                                    ? "bg-orange-500 text-white"
                                    : "bg-slate-100 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
                                }`}
                              title="تبديل الإنذار الأول (برتقالي)"
                            >
                              إنذار 1
                            </button>

                            {/* إنذار 2 (أخضر) */}
                            <button
                              onClick={() => hasReader && toggleWarning(row.juz, 2)}
                              disabled={!hasReader}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${!hasReader
                                  ? "bg-slate-50 text-slate-200 cursor-not-allowed"
                                  : row.warning2
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                                }`}
                              title="تبديل الإنذار الثاني (أخضر)"
                            >
                              إنذار 2
                            </button>

                            {/* إنذار 3 (أحمر) */}
                            <button
                              onClick={() => hasReader && toggleWarning(row.juz, 3)}
                              disabled={!hasReader}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${!hasReader
                                  ? "bg-slate-50 text-slate-200 cursor-not-allowed"
                                  : row.warning3
                                    ? "bg-rose-600 text-white"
                                    : "bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                }`}
                              title="تبديل الإنذار الثالث (أحمر)"
                            >
                              إنذار 3
                            </button>
                          </div>

                          {/* الشارات الثابتة الملونة التي تظهر بالتصدير والطباعة بوضوح */}
                          <div className="flex items-center gap-1 min-w-[80px] justify-center">
                            {row.warning1 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                إنذار أول
                              </span>
                            )}
                            {row.warning2 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                إنذار ثانٍ
                              </span>
                            )}
                            {row.warning3 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                إنذار ثالث
                              </span>
                            )}
                            {!row.warning1 && !row.warning2 && !row.warning3 && (
                              <span className="text-slate-300 text-xs font-light" data-html2canvas-ignore="true">
                                لا يوجد
                              </span>
                            )}
                          </div>

                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 4. حقل الملاحظات أسفل الجدول (مع الحفظ الفوري) */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span>📝</span>
            <span>ملاحظات وإرشادات الختمة:</span>
          </h3>
          {exporting ? (
            <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap min-h-[8rem] text-right">
              {notes || "لا توجد ملاحظات"}
            </div>
          ) : (
            <textarea
              value={notes}
              onChange={handleNotesChange}
              placeholder="اكتب هنا أي ملاحظات أو قوانين للختمة الجماعية..."
              className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white text-slate-700 text-sm leading-relaxed transition-all"
            />
          )}
          <p className="text-[10px] text-slate-400 mt-1" data-html2canvas-ignore="true">
            * يتم حفظ الملاحظات محلياً بشكل تلقائي فور الكتابة.
          </p>
        </div>

      </div>

      {/* --- شريط الأزرار السفلية وإجراءات إنهاء الختمة والتدوير (غير قابلة للتصدير) --- */}
      <div 
        data-html2canvas-ignore="true" 
        className="mt-8 p-4 sm:p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-6"
      >
        <div className="flex flex-col gap-1 items-center md:items-start text-center md:text-right">
          <h3 className="font-bold text-lg text-emerald-300 flex items-center gap-2">
            <CheckCircle2 size={20} />
            بوابة الانتقال إلى الشهر الجديد
          </h3>
          <p className="text-xs text-slate-300">
            للحفاظ على البيانات، يجب تفعيل زر "إنهاء الختمة" أولاً كبوابة حماية لتفعيل التدوير والتصفير التلقائي.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {/* زر إنهاء الختمة الحاليّة */}
          <button
            onClick={handleFinishKhatma}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all shadow-md ${isGateUnlocked
                ? "bg-slate-700 text-emerald-400 border border-emerald-500/30 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-600 text-slate-900 hover:scale-[1.02]"
              }`}
            disabled={isGateUnlocked}
          >
            <CheckCircle2 size={16} />
            {isGateUnlocked ? "تم تفعيل بوابة التدوير" : "إنهاء الختمة الحالية"}
          </button>

          {/* زر تدوير الأدوار للشهر التالي */}
          <button
            onClick={handleRotateMonth}
            disabled={!isGateUnlocked}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all shadow-md ${!isGateUnlocked
                ? "bg-slate-700/50 text-slate-500 border border-slate-700/20 cursor-not-allowed"
                : "bg-amber-500 hover:bg-amber-600 text-slate-900 hover:scale-[1.02] animate-pulse"
              }`}
            title={!isGateUnlocked ? "يرجى الضغط على زر إنهاء الختمة أولاً" : "ابدأ تدوير الأسماء للشهر الجديد"}
          >
            <RotateCw size={16} />
            تدوير الأدوار للشهر الجديد
          </button>
        </div>
      </div>

      {/* --- أزرار التصدير العائمة في الأسفل --- */}
      <div
        data-html2canvas-ignore="true"
        className="mt-6 flex flex-wrap justify-center gap-3"
      >
        <button
          onClick={handleExportPNG}
          disabled={exporting}
          className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl border border-slate-200 shadow-sm hover:shadow transition-all text-sm"
        >
          <ImageIcon className="text-emerald-500" size={16} />
          تصدير كصورة PNG
        </button>

        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl border border-slate-200 shadow-sm hover:shadow transition-all text-sm"
        >
          <FileText className="text-sky-500" size={16} />
          تصدير كملف PDF للطباعة
        </button>
      </div>

      {/* معلومات إضافية تحت الأزرار */}
      <div
        data-html2canvas-ignore="true"
        className="mt-8 text-center text-xs text-slate-400 flex flex-col items-center gap-1"
      >
        <p>مطور لمتابعة قراءة القرآن الكريم بشكل جماعي ومنظم شهرياً.</p>
        <p className="flex items-center gap-1">
          <Info size={12} className="text-slate-400" />
          <span>تلميح للتصدير: يتم استبعاد جميع أزرار التعديل والحذف والخيارات من الصورة والملف المصدر تلقائياً للحصول على تقرير نظيف.</span>
        </p>
      </div>

      {/* --- نافذة التأكيد المنبثقة المخصصة (Custom Confirmation Popup Modal) --- */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" data-html2canvas-ignore="true">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scale-up text-right">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2.5 rounded-2xl ${confirmModal.type === "danger"
                  ? "bg-rose-50 text-rose-600"
                  : confirmModal.type === "success"
                    ? "bg-emerald-50 text-emerald-600"
                    : confirmModal.type === "info"
                      ? "bg-sky-50 text-sky-600"
                      : "bg-amber-50 text-amber-600"
                }`}>
                {confirmModal.type === "danger" ? (
                  <Trash2 size={24} />
                ) : confirmModal.type === "success" ? (
                  <CheckCircle2 size={24} />
                ) : confirmModal.type === "info" ? (
                  <Info size={24} />
                ) : (
                  <Info size={24} className="text-amber-500" />
                )}
              </div>
              <h3 className="text-lg font-black text-slate-800">
                {confirmModal.title}
              </h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              {confirmModal.message}
            </p>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                {confirmModal.cancelText || "إلغاء"}
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-5 py-2.5 rounded-xl text-white font-semibold text-xs shadow-sm hover:shadow transition-colors ${confirmModal.type === "danger"
                    ? "bg-rose-500 hover:bg-rose-600"
                    : confirmModal.type === "success"
                      ? "bg-emerald-500 hover:bg-emerald-600 text-slate-900"
                      : confirmModal.type === "info"
                        ? "bg-sky-500 hover:bg-sky-600"
                        : "bg-amber-500 hover:bg-amber-600 text-slate-900"
                  }`}
              >
                {confirmModal.confirmText || "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
