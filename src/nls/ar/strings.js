/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

define({
  "SYSTEM_DEFAULT": "افتراضي النظام",
  "PROJECT_BUSY": "عمليات المشروع قيد التقدم",
  "DUPLICATING": "نسخ {0}",
  "MOVING": "نقل {0}",
  "COPYING": "نسخ {0}",
  "DELETING": "حذف {0}",
  "DELETE_TO_TRASH": "نقل {0} إلى سلة المهملات",
  "DELETE_TO_RECYCLE_BIN": "نقل {0} إلى سلة المحذوفات",
  "RENAMING": "إعادة تسمية",
  "STORED_IN_YOUR_BROWSER": "مخزّن في متصفحك",
  "SUPPORT_US_OPEN_COLLECTIVE": "ادعمنا على جيتهاب سبونسورز",
  "GENERIC_ERROR": "(خطأ {0})",
  "NOT_FOUND_ERR": "تعذر العثور على الملف/المجلد.",
  "NOT_READABLE_ERR": "تعذر قراءة الملف/المجلد.",
  "EXCEEDS_MAX_FILE_SIZE": "لا يمكن فتح الملفات التي يزيد حجمها عن {0} ميجابايت في {APP_NAME}.",
  "NO_MODIFICATION_ALLOWED_ERR": "لا يمكن تعديل المجلد الهدف.",
  "NO_MODIFICATION_ALLOWED_ERR_FILE": "لا تسمح لك الأذونات بإجراء تعديلات.",
  "CONTENTS_MODIFIED_ERR": "تم تعديل الملف خارج {APP_NAME}.",
  "UNSUPPORTED_ENCODING_ERR": "تنسيق ترميز غير معروف",
  "ENCODE_FILE_FAILED_ERR": "تعذر على {APP_NAME} ترميز محتويات الملف.",
  "DECODE_FILE_FAILED_ERR": "لم يتمكن {APP_NAME} من فك تشفير محتويات الملف.",
  "UNSUPPORTED_UTF16_ENCODING_ERR": "لا يدعم {APP_NAME} حاليًا ملفات النصوص المشفرة بتنسيق UTF-16.",
  "FILE_EXISTS_ERR": "الملف أو المجلد موجود بالفعل.",
  "FILE": "ملف",
  "FILE_TITLE": "ملف",
  "DIRECTORY": "مجلد",
  "DIRECTORY_TITLE": "مجلد",
  "DIRECTORY_NAMES_LEDE": "أسماء المجلدات",
  "FILENAMES_LEDE": "أسماء الملفات",
  "FILENAME": "اسم الملف",
  "DIRECTORY_NAME": "اسم المجلد",
  "ERROR_LOADING_PROJECT": "خطأ في تحميل المشروع",
  "OPEN_DIALOG_ERROR": "حدث خطأ أثناء عرض مربع حوار فتح الملف. (خطأ {0})",
  "REQUEST_NATIVE_FILE_SYSTEM_ERROR": "حدث خطأ أثناء محاولة تحميل المجلد <span class='dialog-filename'>{0}</span>. (خطأ {1})",
  "READ_DIRECTORY_ENTRIES_ERROR": "حدث خطأ أثناء قراءة محتويات المجلد <span class='dialog-filename'>{0}</span>. (خطأ {1})",
  "ZOOM_WITH_SHORTCUTS": "استخدم اختصارات لوحة المفاتيح للتكبير/التصغير",
  "ZOOM_WITH_SHORTCUTS_DETAILS": "الرجاء استخدام اختصارات لوحة المفاتيح <code><i>{0}</i></code> للتكبير و <code><i>{1}</i></code> للتصغير.",
  "ERROR_OPENING_FILE_TITLE": "خطأ في فتح الملف",
  "ERROR_OPENING_FILE": "حدث خطأ أثناء محاولة فتح الملف <span class='dialog-filename'>{0}</span>. {1}",
  "ERROR_OPENING_FILES": "حدث خطأ أثناء محاولة فتح الملفات التالية:",
  "ERROR_RELOADING_FILE_TITLE": "خطأ في إعادة تحميل التغييرات من القرص",
  "ERROR_RELOADING_FILE": "حدث خطأ أثناء محاولة إعادة تحميل الملف <span class='dialog-filename'>{0}</span>. {1}",
  "ERROR_SAVING_FILE_TITLE": "خطأ في حفظ الملف",
  "ERROR_SAVING_FILE": "حدث خطأ أثناء محاولة حفظ الملف <span class='dialog-filename'>{0}</span>. {1}",
  "ERROR_RENAMING_FILE_TITLE": "خطأ في إعادة تسمية {0}",
  "ERROR_RENAMING_FILE": "حدث خطأ أثناء محاولة إعادة تسمية {2} <span class='dialog-filename'>{0}</span>. {1}",
  "ERROR_RENAMING_NOT_IN_PROJECT": "الملف أو المجلد ليس جزءًا من المشروع المفتوح حاليًا. للأسف، لا يمكن إعادة تسمية سوى ملفات المشروع في هذه المرحلة.",
  "ERROR_MOVING_FILE_TITLE": "خطأ في نقل {0}",
  "ERROR_MOVING_FILE": "حدث خطأ أثناء محاولة نقل {2} <span class='dialog-filename'>{0}</span>. {1}",
  "ERROR_MOVING_NOT_IN_PROJECT": "لا يمكن نقل الملف/المجلد، لأنه ليس جزءًا من المشروع الحالي.",
  "ERROR_DELETING_FILE_TITLE": "خطأ في حذف {0}",
  "ERROR_DELETING_FILE": "حدث خطأ أثناء محاولة حذف {2} <span class='dialog-filename'>{0}</span>. {1}",
  "INVALID_FILENAME_TITLE": "اسم ملف {0} غير صالح",
  "CANNOT_PASTE_TITLE": "لا يمكن اللصق {0}",
  "CANNOT_DOWNLOAD_TITLE": "لا يمكن التنزيل {0}",
  "ERR_TYPE_DOWNLOAD_FAILED": "حدث خطأ أثناء تنزيل <span class='dialog-filename'>{0}</span>",
  "ERR_TYPE_PASTE_FAILED": "حدث خطأ أثناء لصق <span class='dialog-filename'>{0}</span> إلى <span class='dialog-filename'>{1}</span>",
  "CANNOT_DUPLICATE_TITLE": "لا يمكن النسخ",
  "ERR_TYPE_DUPLICATE_FAILED": "حدث خطأ أثناء نسخ <span class='dialog-filename'>{0}</span>",
  "ERR_TYPE_DUPLICATE_FAILED_NO_FILE": "الرجاء تحديد ملف للنسخ.",
  "INVALID_FILENAME_MESSAGE": "لا يمكن لـ {0} استخدام أي كلمات محجوزة للنظام، أو أن ينتهي بنقاط (.) أو استخدام أي من الأحرف التالية: <code class='emphasized'>{1}</code>",
  "ENTRY_WITH_SAME_NAME_EXISTS": "يوجد بالفعل ملف أو مجلد بالاسم <span class='dialog-filename'>{0}</span>.",
  "ERROR_CREATING_FILE_TITLE": "خطأ في إنشاء {0}",
  "ERROR_CREATING_FILE": "حدث خطأ أثناء محاولة إنشاء {0} <span class='dialog-filename'>{1}</span>. {2}",
  "ERROR_MIXED_DRAGDROP": "لا يمكن فتح مجلد في نفس وقت فتح ملفات أخرى.",
  "DROP_TO_OPEN_FILES": "أسقط لفتح الملفات",
  "DROP_TO_OPEN_FILE": "أسقط لفتح الملف",
  "DROP_TO_OPEN_PROJECT": "أسقط لفتح المجلد `{0}` كمشروع",
  "ERROR_KEYMAP_TITLE": "خطأ في قراءة خريطة مفاتيح المستخدم",
  "ERROR_KEYMAP_CORRUPT": "ملف خريطة المفاتيح الخاص بك ليس بصيغة JSON صالحة. سيتم فتح الملف حتى تتمكن من تصحيح التنسيق.",
  "ERROR_LOADING_KEYMAP": "ملف خريطة المفاتيح الخاص بك ليس ملف نصي بتشفير UTF-8 صالحًا ولا يمكن تحميله",
  "ERROR_RESTRICTED_COMMANDS": "لا يمكنك إعادة تعيين اختصارات لهذه الأوامر: {0}",
  "ERROR_RESTRICTED_SHORTCUTS": "لا يمكنك إعادة تعيين هذه الاختصارات: {0}",
  "ERROR_MULTIPLE_SHORTCUTS": "أنت تقوم بإعادة تعيين اختصارات متعددة لهذه الأوامر: {0}",
  "ERROR_DUPLICATE_SHORTCUTS": "لديك ارتباطات متعددة لهذه الاختصارات: {0}",
  "ERROR_INVALID_SHORTCUTS": "هذه الاختصارات غير صالحة: {0}",
  "ERROR_NONEXISTENT_COMMANDS": "أنت تقوم بتعيين اختصارات لأوامر غير موجودة: {0}",
  "ERROR_PREFS_CORRUPT_TITLE": "خطأ في قراءة التفضيلات",
  "ERROR_PREFS_RESET_TITLE": "تمت إعادة تعيين الإعدادات - إعادة التشغيل مطلوبة",
  "ERROR_PREFS_PROJECT_LINT": "تفضيلات المشروع",
  "ERROR_PREFS_PROJECT_LINT_MESSAGE": "خطأ: يحتوي المشروع على كلا الملفين `.brackets.json` و `.phcode.json`، مما يتسبب في حدوث تعارض. يُرجى حذف إما `.brackets.json` أو `.phcode.json` ثم إعادة تحميل المشروع.",
  "ERROR_PREFS_CORRUPT": "ملف التفضيلات الخاص بك ليس بصيغة JSON صالحة. سيتم فتح الملف حتى تتمكن من تصحيح التنسيق. ستحتاج إلى إعادة تشغيل {APP_NAME} لكي تسري التغييرات.",
  "ERROR_PREFS_CORRUPT_RESET": "إعدادات {APP_NAME} الخاصة بك تالفة وقد تمت إعادة تعيينها. يُرجى إعادة تشغيل {APP_NAME} لكي تسري التغييرات.",
  "ERROR_PROJ_PREFS_CORRUPT": "ملف تفضيلات مشروعك ليس بصيغة JSON صالحة. سيتم فتح الملف حتى تتمكن من تصحيح التنسيق. ستحتاج إلى إعادة تحميل المشروع لكي تسري التغييرات.",
  "ERROR_IN_BROWSER_TITLE": "عفوًا! {APP_NAME} لا يعمل في المتصفحات حتى الآن.",
  "ERROR_IN_BROWSER": "تم بناء {APP_NAME} بلغة HTML، ولكنه يعمل الآن كتطبيق سطح مكتب حتى تتمكن من استخدامه لتحرير الملفات المحلية. يُرجى استخدام تطبيق shell  في مستودع <b>github.com/adobe/brackets-shell</b> لتشغيل {APP_NAME}.",
  "ERROR_MAX_FILES_TITLE": "خطأ في فهرسة الملفات",
  "ERROR_MAX_FILES": "يحتوي هذا المشروع على أكثر من ٣٠,٠٠٠ ملف. قد يتم تعطيل الميزات التي تعمل عبر ملفات متعددة أو تتصرف كما لو كان المشروع فارغًا. <a href='https://github.com/adobe/brackets/wiki/Large-Projects'>اقرأ المزيد حول العمل مع المشاريع الكبيرة</a>.",
  "UNSUPPORTED_DOM_APIS_CONFIRM": "واجهات برمجة التطبيقات `window.confirm` و `window.prompt` غير متوفرة في المعاينة المباشرة المضمنة في {APP_NAME}. يُرجى فصل المعاينة المباشرة لاستخدام واجهات برمجة التطبيقات هذه في المتصفح.",
  "ERROR_LAUNCHING_BROWSER_TITLE": "خطأ في تشغيل المتصفح",
  "ERROR_CANT_FIND_CHROME": "لم يتم العثور على متصفح جوجل كروم. الرجاء التأكد من تثبيته.",
  "ERROR_LAUNCHING_BROWSER": "حدث خطأ أثناء تشغيل المتصفح. (خطأ {0})",
  "LIVE_DEVELOPMENT_ERROR_TITLE": "خطأ في المعاينة المباشرة",
  "LIVE_DEVELOPMENT_RELAUNCH_TITLE": "الاتصال بالمتصفح",
  "LIVE_DEVELOPMENT_ERROR_MESSAGE": "لكي تتصل المعاينة المباشرة، يجب إعادة تشغيل Chrome مع تمكين تصحيح الأخطاء عن بُعد.<br /><br />هل تريد إعادة تشغيل Chrome وتمكين تصحيح الأخطاء عن بُعد؟<br /><br />",
  "LIVE_DEV_LOADING_ERROR_MESSAGE": "تعذر تحميل صفحة المعاينة المباشرة.",
  "LIVE_DEV_NEED_BASEURL_MESSAGE": "لتشغيل المعاينة المباشرة باستخدام ملف من جانب الخادم، يجب تحديد عنوان URL أساسي لهذا المشروع.",
  "LIVE_DEV_SERVER_NOT_READY_MESSAGE": "خطأ في بدء تشغيل خادم HTTP لملفات المعاينة المباشرة. الرجاء المحاولة مرة أخرى.",
  "LIVE_DEVELOPMENT_TROUBLESHOOTING": "لمزيد من المعلومات، راجع <a href='{0}' title='{0}'>استكشاف أخطاء اتصال المعاينة المباشرة وإصلاحها</a>.",
  "LIVE_PREVIEW_HIDE_OVERLAY": "إخفاء هذه الرسالة",
  "LIVE_DEV_STATUS_TIP_NOT_CONNECTED": "المعاينة المباشرة",
  "LIVE_DEV_STATUS_TIP_PROGRESS1": "معاينة مباشرة: جارٍ الاتصال…",
  "LIVE_DEV_STATUS_TIP_PROGRESS2": "معاينة مباشرة: جارٍ التهيئة…",
  "LIVE_DEV_STATUS_TIP_CONNECTED": "خادم المعاينة المباشرة نشط",
  "LIVE_DEV_STATUS_TIP_OUT_OF_SYNC": "معاينة مباشرة",
  "LIVE_DEV_TOOLTIP_SHOW_IN_EDITOR": "{0} - إظهار في المحرر…",
  "LIVE_DEV_SELECT_FILE_TO_PREVIEW": "تحديد ملف للمعاينة المباشرة",
  "LIVE_DEV_CLICK_TO_RELOAD_PAGE": "إعادة تحميل الصفحة",
  "LIVE_DEV_TOGGLE_LIVE_HIGHLIGHT": "تبديل تمييزات المعاينة المباشرة",
  "LIVE_DEV_CLICK_POPOUT": "فتح المعاينة المباشرة في نافذة جديدة",
  "LIVE_DEV_OPEN_CHROME": "فتح في كروم…",
  "LIVE_DEV_OPEN_SAFARI": "فتح في سفاري…",
  "LIVE_DEV_OPEN_EDGE": "فتح في إيدج…",
  "LIVE_DEV_OPEN_FIREFOX": "فتح في فايرفوكس…",
  "LIVE_DEV_OPEN_ERROR_TITLE": "خطأ في فتح المعاينة المباشرة في {0}",
  "LIVE_DEV_OPEN_ERROR_MESSAGE": "تأكد من تثبيت متصفح {0} وحاول مرة أخرى.",
  "LIVE_DEV_CLICK_TO_PIN_UNPIN": "تثبيت أو إلغاء تثبيت صفحة المعاينة",
  "LIVE_DEV_STATUS_TIP_SYNC_ERROR": "معاينة مباشرة (لا يتم التحديث بسبب خطأ في بناء الجملة)",
  "LIVE_DEV_SETTINGS": "إعدادات المعاينة المباشرة…",
  "LIVE_DEV_SETTINGS_BANNER": "قم بإعداد خادم مخصص لمعاينة `<b>{0}</b>` والملفات الأخرى التي يتم عرضها على الخادم (PHP وJSP، إلخ) بشكل مباشر.",
  "LIVE_DEV_SETTINGS_TITLE": "إعدادات المعاينة المباشرة",
  "LIVE_DEV_SETTINGS_STARTUP": "إظهار لوحة المعاينة المباشرة عند بدء التشغيل",
  "LIVE_DEV_SETTINGS_SERVER_PREFERENCE": "`true` لتمكين خادم التطوير المخصص",
  "LIVE_DEV_SETTINGS_STARTUP_PREFERENCE": "`true` لإظهار لوحة المعاينة المباشرة عند بدء التشغيل",
  "LIVE_DEV_SETTINGS_HOT_RELOAD_PREFERENCE": "`true` إذا كان الخادم يدعم إعادة التحميل السريع وتعطيل إعادة تحميل المعاينة المباشرة عند الحفظ",
  "LIVE_DEV_SETTINGS_USE_SERVER": "استخدام خادم تطوير مخصص لهذا المشروع",
  "LIVE_DEV_SETTINGS_SERVE_PREFERENCE": "عنوان URL لخادم التطوير الخاص بك للمشروع، على سبيل المثال: http://localhost:8000/php",
  "LIVE_DEV_SETTINGS_SERVER_INBUILT": "على سبيل المثال: http://localhost:8000/php - حاليًا يتم استخدام الخادم المدمج.",
  "LIVE_DEV_SETTINGS_SERVER_ROOT": "مجلد الخدمة في المشروع",
  "LIVE_DEV_SETTINGS_SERVER_ROOT_HELP": "على سبيل المثال: www/ (الافتراضي هو /)",
  "LIVE_DEV_SETTINGS_SERVER_ROOT_PREF": "المسار داخل المشروع الذي يخدمه خادم التطوير، على سبيل المثال: www/ (الافتراضي هو /)",
  "LIVE_DEV_SETTINGS_RELOAD": "الخادم يدعم التحديث السريع",
  "LIVE_DEV_SETTINGS_RELOAD_HELP": "بعض الخوادم تدعم التحديث السريع حيث يتم دفع تغييرات الشفرة إلى الصفحة دون إعادة تحميل الصفحة بالكامل.",
  "LIVE_DEV_SETTINGS_FRAMEWORK": "إطار عمل الخادم",
  "LIVE_DEV_SETTINGS_FRAMEWORK_CUSTOM": "مخصص",
  "LIVE_DEV_SETTINGS_FRAMEWORK_PREFERENCES": "إطار عمل الخادم، يدعم حاليًا دوكوسورس فقط",
  "LIVE_DEV_SETTINGS_ELEMENT_HIGHLIGHT_PREFERENCE": "فحص العنصر في المعاينة المباشرة عند 'المرور' أو 'النقر'. القيمة الافتراضية هي 'المرور'",
  "LIVE_DEV_SETTINGS_SHOW_RULER_LINES_PREFERENCE": "إظهار القياسات عند تحديد العناصر في المعاينة المباشرة. الإعداد الافتراضي هو 'false'",
  "LIVE_DEV_TOOLBOX_SELECT_PARENT": "تحديد الأصل",
  "LIVE_DEV_TOOLBOX_EDIT_TEXT": "تحرير النص",
  "LIVE_DEV_TOOLBOX_EDIT_HYPERLINK": "تحرير الارتباط التشعبي",
  "LIVE_DEV_HYPERLINK_NO_HREF": "لم يتم تعيين href",
  "LIVE_DEV_HYPERLINK_OPEN_LINK": "فتح هذا الرابط",
  "LIVE_DEV_HYPERLINK_OPENS_NEW_TAB": "فتح في علامة تبويب جديدة",
  "LIVE_DEV_TOOLBOX_DUPLICATE": "تكرار",
  "LIVE_DEV_TOOLBOX_DELETE": "حذف",
  "LIVE_DEV_TOOLBOX_AI": "تحرير بالذكاء الاصطناعي",
  "LIVE_DEV_TOOLBOX_IMAGE_GALLERY": "معرض الصور",
  "LIVE_DEV_TOOLBOX_MORE_OPTIONS": "خيارات إضافية",
  "LIVE_DEV_MORE_OPTIONS_CUT": "قص",
  "LIVE_DEV_MORE_OPTIONS_COPY": "نسخ",
  "LIVE_DEV_MORE_OPTIONS_PASTE": "لصق",
  "LIVE_DEV_IMAGE_GALLERY_USE_IMAGE": "تنزيل الصورة",
  "LIVE_DEV_IMAGE_GALLERY_SELECT_DOWNLOAD_FOLDER": "اختر مجلد تنزيل الصور",
  "LIVE_DEV_IMAGE_GALLERY_SEARCH_PLACEHOLDER": "ابحث عن صور...",
  "LIVE_DEV_IMAGE_GALLERY_SEARCH_BUTTON": "بحث",
  "LIVE_DEV_IMAGE_GALLERY_LOADING_INITIAL": "جارٍ تحميل الصور...",
  "LIVE_DEV_IMAGE_GALLERY_LOADING_MORE": "جارٍ التحميل...",
  "LIVE_DEV_IMAGE_GALLERY_NO_IMAGES": "لم يتم العثور على صور",
  "LIVE_DEV_IMAGE_GALLERY_LOAD_ERROR": "فشل تحميل الصور",
  "LIVE_DEV_IMAGE_GALLERY_CLOSE": "إغلاق",
  "LIVE_DEV_IMAGE_GALLERY_SELECT_FROM_COMPUTER_TOOLTIP": "حدد صورة من جهازك",
  "LIVE_DEV_IMAGE_GALLERY_SELECT_FROM_COMPUTER": "تحديد من الجهاز",
  "LIVE_DEV_IMAGE_GALLERY_DIALOG_OVERLAY_MESSAGE": "حدد موقع تنزيل الصورة في المحرر للمتابعة",
  "LIVE_DEV_IMAGE_GALLERY_OFFLINE_BANNER": "لا يوجد اتصال - العمل في وضع عدم الاتصال",
  "LIVE_DEV_IMAGE_GALLERY_OFFLINE_RETRY": "إعادة المحاولة",
  "LIVE_DEV_IMAGE_GALLERY_CHECKING_CONNECTION": "جارٍ التحقق من الاتصال",
  "LIVE_DEV_IMAGE_GALLERY_STILL_OFFLINE": "لا يزال غير متصل. يرجى التحقق من اتصالك.",
  "LIVE_DEV_IMAGE_GALLERY_SELECT_SIZE": "اختر حجم الصورة",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_THUMBNAIL": "صورة مصغرة",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_XS": "صورة رمزية",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_SM": "بطاقة",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_MD": "محتوى",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_REGULAR": "قياسي",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_LG": "رئيسي",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_XL": "لافتة",
  "LIVE_DEV_IMAGE_GALLERY_SIZE_RETINA": "Retina",
  "LIVE_DEV_IMAGE_GALLERY_ATTRIBUTION_ON": "على {0}",
  "LIVE_DEV_IMAGE_GALLERY_GET_PRO": "احصل على Pro",
  "LIVE_DEV_IMAGE_GALLERY_USAGE_THRESHOLD": "لقد استخدمت {0}% من عمليات البحث المجانية عن الصور ({1}/{2})",
  "LIVE_DEV_TOAST_NOT_EDITABLE": "العنصر غير قابل للتعديل - تم إنشاؤه بواسطة برنامج نصي",
  "LIVE_DEV_COPY_TOAST_MESSAGE": "تم نسخ العنصر. استخدم 'لصق' لإضافته بعد العنصر المحدد",
  "LIVE_DEV_TOAST_FIXED_ELEMENT_DISMISSED": "العنصر لا يتم تمريره مع الصفحة - مربعات التعديل مخفية",
  "LIVE_DEV_IMAGE_FOLDER_DIALOG_TITLE": "حدد مجلدًا لحفظ الصورة",
  "LIVE_DEV_IMAGE_FOLDER_DIALOG_DESCRIPTION": "اختر مكان تنزيل الصورة:",
  "LIVE_DEV_IMAGE_FOLDER_DIALOG_PLACEHOLDER": "اكتب مسار المجلد (مثال: assets/images/)",
  "LIVE_DEV_IMAGE_FOLDER_DIALOG_HELP": "💡 أدخل مسار المجلد أو اتركه فارغًا للتنزيل في مجلد 'images'.",
  "LIVE_DEV_IMAGE_FOLDER_DIALOG_REMEMBER": "لا تسأل مرة أخرى بخصوص هذا المشروع",
  "IMAGE_SEARCH_LIMIT_TITLE": "تم الوصول إلى الحد الأقصى للبحث عن الصور",
  "IMAGE_SEARCH_LIMIT_MESSAGE": "لقد استنفدت كل عمليات البحث عن الصور المتاحة لك هذا الشهر وعددها {0}.<br>ابدأ خطة Phoenix Pro مدفوعة لإزالة قيود النسخة التجريبية ومواصلة البحث.",
  "IMAGE_SEARCH_LIMIT_MESSAGE_THROTTLE": "البحث عن الصور غير متاح مؤقتًا بسبب كثرة الطلب.<br>ابدأ خطة Phoenix Pro مدفوعة لإزالة قيود النسخة التجريبية ومواصلة البحث.",
  "IMAGE_SEARCH_PRO_THROTTLE_TITLE": "تم الوصول إلى حد البحث عن الصور",
  "IMAGE_SEARCH_PRO_THROTTLE_MESSAGE": "البحث عن الصور غير متاح مؤقتًا بسبب كثرة الطلب. عادةً ما يُحل هذا الأمر في غضون ساعة — يرجى المحاولة مرة أخرى قريبًا.",
  "LIVE_DEV_AI_PROMPT_PLACEHOLDER": "اطلب من فينيكس AI تعديل هذا العنصر...",
  "LIVE_PREVIEW_CUSTOM_SERVER_BANNER": "الحصول على معاينة من خادمك المخصص {0}",
  "LIVE_PREVIEW_MODE_TOGGLE_PREVIEW": "تبديل وضع المعاينة (F8)",
  "LIVE_PREVIEW_MODE_PREVIEW": "وضع المعاينة",
  "LIVE_PREVIEW_MODE_HIGHLIGHT": "وضع التمييز",
  "LIVE_PREVIEW_MODE_EDIT": "وضع التحرير",
  "LIVE_PREVIEW_EDIT_HIGHLIGHT_ON": "فحص العنصر عند التمرير",
  "LIVE_PREVIEW_SHOW_RULER_LINES": "إظهار القياسات",
  "LIVE_PREVIEW_MODE_PREFERENCE": "يعرض '{0}' صفحة الويب فقط، ويربط '{1}' صفحة الويب بالتعليمات البرمجية الخاصة بك - انقر فوق العناصر للانتقال إلى التعليمات البرمجية الخاصة بها والعكس صحيح، ويوفر '{2}' التمييز إلى جانب المعالجة المتقدمة للعناصر",
  "LIVE_PREVIEW_CONFIGURE_MODES": "تكوين أوضاع المعاينة المباشرة",
  "LIVE_DEV_DETACHED_REPLACED_WITH_DEVTOOLS": "تم إلغاء المعاينة المباشرة لأن أدوات مطوّري المتصفح كانت مفتوحة",
  "LIVE_DEV_DETACHED_TARGET_CLOSED": "تم إلغاء المعاينة المباشرة لأن الصفحة تم إغلاقها في المتصفح",
  "LIVE_DEV_NAVIGATED_AWAY": "تم إلغاء المعاينة المباشرة لأن المتصفح انتقل إلى صفحة ليست جزءًا من المشروع الحالي",
  "LIVE_DEV_CLOSED_UNKNOWN_REASON": "تم إلغاء المعاينة المباشرة لسبب غير معروف ({0})",
  "SAVE_CLOSE_TITLE": "حفظ التغييرات",
  "SAVE_CLOSE_MESSAGE": "هل تريد حفظ التغييرات التي أجريتها في المستند <span class='dialog-filename'>{0}</span>؟",
  "SAVE_CLOSE_MULTI_MESSAGE": "هل تريد حفظ التغييرات التي أجريتها على الملفات التالية؟",
  "EXT_MODIFIED_TITLE": "تغييرات خارجية",
  "CONFIRM_DELETE_TITLE": "تأكيد الحذف",
  "CONFIRM_FILE_DELETE": "هل أنت متأكد أنك تريد حذف الملف <span class='dialog-filename'>{0}</span>؟",
  "CONFIRM_FOLDER_DELETE": "هل أنت متأكد أنك تريد حذف المجلد <span class='dialog-filename'>{0}</span>؟",
  "CONFIRM_FILE_DELETE_TRASH": "هل أنت متأكد أنك تريد حذف الملف <span class='dialog-filename'>{0}</span>؟<br>يمكنك استعادة هذا الملف من سلة المهملات.",
  "CONFIRM_FOLDER_DELETE_TRASH": "هل أنت متأكد أنك تريد حذف المجلد <span class='dialog-filename'>{0}</span>؟<br>يمكنك استعادة هذا المجلد من سلة المهملات.",
  "CONFIRM_FILE_DELETE_RECYCLE_BIN": "هل أنت متأكد أنك تريد حذف الملف <span class='dialog-filename'>{0}</span>؟<br>يمكنك استعادة هذا الملف من سلة المحذوفات.",
  "CONFIRM_FOLDER_DELETE_RECYCLE_BIN": "هل أنت متأكد أنك تريد حذف المجلد <span class='dialog-filename'>{0}</span>؟<br>يمكنك استعادة هذا المجلد من سلة المحذوفات.",
  "MOVE_TO_TRASH": "نقل إلى سلة المهملات",
  "MOVE_TO_RECYCLE_BIN": "نقل إلى سلة المحذوفات",
  "FILE_DELETED_TITLE": "تم حذف الملف",
  "EXT_MODIFIED_WARNING": "تم تعديل <span class='dialog-filename'>{0}</span> على القرص خارج {APP_NAME}.<br /><br />هل تريد حفظ الملف وكتابة التغييرات الموجودة؟",
  "EXT_MODIFIED_MESSAGE": "تم تعديل <span class='dialog-filename'>{0}</span> على القرص خارج {APP_NAME}، ولكن لديه أيضًا تغييرات غير محفوظة في {APP_NAME}.<br /><br />أي نسخة تريد الاحتفاظ بها؟",
  "EXT_DELETED_MESSAGE": "تم حذف <span class='dialog-filename'>{0}</span> على القرص خارج {APP_NAME}، ولكن لديه تغييرات غير محفوظة في {APP_NAME}.<br /><br />هل تريد الاحتفاظ بتغييراتك؟",
  "EXT_ALWAYS_MODIFIED_BUTTON_TOOLTIP": "استبدل الملفات دائمًا حتى تبديل المشروع أو إعادة التشغيل",
  "WINDOW_UNLOAD_WARNING": "هل أنت متأكد أنك تريد الانتقال إلى عنوان URL مختلف ومغادرة {APP_NAME}؟",
  "WINDOW_UNLOAD_WARNING_WITH_UNSAVED_CHANGES": "لديك تغييرات غير محفوظة! هل أنت متأكد أنك تريد الانتقال إلى عنوان URL مختلف ومغادرة {APP_NAME}؟",
  "DONE": "تم",
  "OK": "موافق",
  "CANCEL": "إلغاء",
  "DONT_SAVE": "لا تحفظ",
  "SAVE": "حفظ",
  "SAVE_AS": "حفظ باسم…",
  "SAVE_AND_OVERWRITE": "استبدال",
  "ALWAYS_OVERWRITE": "استبدال دائمًا",
  "DELETE": "حذف",
  "BUTTON_YES": "نعم",
  "BUTTON_NO": "لا",
  "FIND_MATCH_INDEX": "{0} من {1}",
  "FIND_NO_RESULTS": "لا توجد نتائج",
  "FIND_QUERY_PLACEHOLDER": "بحث…",
  "FIND_HISTORY_MAX_COUNT": "الحد الأقصى لعدد عناصر البحث في سجل البحث",
  "REPLACE_PLACEHOLDER": "استبدال بـ…",
  "BUTTON_REPLACE_ALL": "استبدال الكل",
  "BUTTON_REPLACE_BATCH": "دفعة…",
  "BUTTON_REPLACE_ALL_IN_FILES": "استبدال…",
  "BUTTON_REPLACE": "استبدال",
  "BUTTON_NEXT": "▶",
  "BUTTON_PREV": "◀",
  "BUTTON_NEXT_HINT": "التطابق التالي",
  "BUTTON_PREV_HINT": "التطابق السابق",
  "BUTTON_CASESENSITIVE_HINT": "تطابق الحروف",
  "BUTTON_REGEXP_HINT": "تعبير نمطي",
  "REPLACE_WITHOUT_UNDO_WARNING_TITLE": "استبدال بدون تراجع",
  "REPLACE_WITHOUT_UNDO_WARNING": "نظرًا لأنه يلزم تغيير أكثر من {0} ملف، سيقوم {APP_NAME} بتعديل الملفات غير المفتوحة على القرص.<br />لن تتمكن من التراجع عن عمليات الاستبدال في تلك الملفات.",
  "BUTTON_REPLACE_WITHOUT_UNDO": "استبدال بدون تراجع",
  "OPEN_FILE": "فتح ملف",
  "SAVE_FILE_AS": "حفظ الملف",
  "CHOOSE_FOLDER": "اختر مجلدًا",
  "RELEASE_NOTES": "ملاحظات الإصدار",
  "NO_UPDATE_TITLE": "أنت مُحدّث!",
  "NO_UPDATE_MESSAGE": "أنت تستخدم أحدث إصدار من {APP_NAME}.",
  "FIND_REPLACE_TITLE_LABEL": "استبدال",
  "FIND_REPLACE_TITLE_WITH": "بـ",
  "FIND_TITLE_LABEL": "تم العثور على",
  "FIND_TITLE_SUMMARY": "&mdash; {0} {1} {2} في {3}",
  "FIND_NUM_FILES": "{0} {1}",
  "FIND_IN_FILES_SCOPED": "في <span class='dialog-filename'>{0}</span>",
  "FIND_IN_FILES_NO_SCOPE": "في المشروع",
  "FIND_IN_FILES_PROJECT_SCOPE": "بحث في المشروع",
  "FIND_IN_FILES_PROJECT_SCOPE_FILTER": "بحث في {0}",
  "FIND_IN_FILES_PROJECT_SCOPE_REPLACE": "استبدال في المشروع",
  "FIND_IN_FILES_PROJECT_SCOPE_REPLACE_FILTER": "استبدال في {0}",
  "FIND_IN_FILES_ZERO_FILES": "عامل التصفية يستبعد جميع الملفات {0}",
  "FIND_IN_FILES_FILE": "ملف",
  "FIND_IN_FILES_FILES": "ملفات",
  "FIND_IN_FILES_MATCH": "تطابق",
  "FIND_IN_FILES_MATCHES": "مطابقات",
  "FIND_IN_FILES_MORE_THAN": "أكثر من",
  "FIND_IN_FILES_PAGING": "{0}&mdash;{1}",
  "FIND_IN_FILES_FILE_PATH": "<span class='dialog-filename'>{0}</span> {2} <span class='dialog-path'>{1}</span>",
  "FIND_IN_FILES_EXPAND_COLLAPSE": "انقر Ctrl/Cmd لتوسيع/طي الكل",
  "FIND_IN_FILES_INDEXING": "فهرسة للبحث الفوري…",
  "FIND_IN_FILES_SEARCHING": "البحث في الملفات…",
  "FIND_IN_FILES_SEARCHING_IN": "في {0}",
  "FIND_IN_FILES_INDEXING_PROGRESS": "فهرسة {0} من {1} ملف للبحث الفوري…",
  "REPLACE_IN_FILES_ERRORS_TITLE": "أخطاء الاستبدال",
  "REPLACE_IN_FILES_ERRORS": "لم يتم تعديل الملفات التالية لأنها تغيرت بعد البحث أو تعذر الكتابة فيها.",
  "ERROR_FETCHING_UPDATE_INFO_TITLE": "خطأ في الحصول على معلومات التحديث",
  "ERROR_FETCHING_UPDATE_INFO_MSG": "حدثت مشكلة في الحصول على أحدث معلومات التحديث من الخادم. يرجى التأكد من اتصالك بالإنترنت وحاول مرة أخرى.",
  "NEW_FILE_FILTER": "مجموعة استثناء جديدة…",
  "CLEAR_FILE_FILTER": "عدم استبعاد الملفات",
  "NO_FILE_FILTER": "لا توجد ملفات مستبعدة",
  "EXCLUDE_FILE_FILTER": "استبعاد الملفات",
  "INCLUDE_FILE_FILTER": "البحث في الملفات",
  "FILTER_PLACEHOLDER": "على سبيل المثال: index,.css,*.js,src/**/*.css",
  "FILTER_HISTORY_TOOLTIP": "اضغط على `Ctrl-Space` لعرض السجل.",
  "FILTER_HISTORY_TOOLTIP_MAC": "اضغط على `Cmd-Space` لعرض السجل.",
  "FIND_HISTORY_TOOLTIP": "اضغط على `Ctrl-Space` لعرض السجل.",
  "FIND_HISTORY_TOOLTIP_MAC": "اضغط على `Cmd-Space` لعرض السجل.",
  "ERROR_QUICK_EDIT_PROVIDER_NOT_FOUND": "لا يتوفر تحرير سريع لموقع المؤشر الحالي.",
  "ERROR_CSSQUICKEDIT_BETWEENCLASSES": "تحرير سريع لـ CSS: ضع المؤشر على اسم صنف واحد.",
  "ERROR_CSSQUICKEDIT_CLASSNOTFOUND": "تحرير سريع لـ CSS: سمة صنف غير مكتملة.",
  "ERROR_CSSQUICKEDIT_IDNOTFOUND": "تحرير سريع لـ CSS: سمة مُعرف غير مكتملة.",
  "ERROR_CSSQUICKEDIT_UNSUPPORTEDATTR": "تحرير سريع لـ CSS: ضع المؤشر في وسم أو صنف أو مُعرف.",
  "ERROR_TIMINGQUICKEDIT_INVALIDSYNTAX": "تحرير سريع لوظيفة التوقيت في CSS: صيغة غير صالحة.",
  "ERROR_JSQUICKEDIT_FUNCTIONNOTFOUND": "تحرير سريع لـ JS: ضع المؤشر في اسم الدالة.",
  "ERROR_QUICK_DOCS_PROVIDER_NOT_FOUND": "لا توجد وثائق سريعة متاحة لموضع المؤشر الحالي",
  "PROJECT_LOADING": "جارٍ التحميل…",
  "UNTITLED": "بدون عنوان",
  "WORKING_FILES": "الملفات قيد العمل",
  "TOP": "أعلى",
  "BOTTOM": "أسفل",
  "LEFT": "يسار",
  "RIGHT": "يمين",
  "CMD_SPLITVIEW_NONE": "بدون تقسيم",
  "CMD_SPLITVIEW_VERTICAL": "تقسيم رأسي",
  "CMD_SPLITVIEW_HORIZONTAL": "تقسيم أفقي",
  "SPLITVIEW_MENU_TOOLTIP": "تقسيم المحرر رأسيًا أو أفقيًا",
  "GEAR_MENU_TOOLTIP": "تكوين مجموعة العمل",
  "CMD_TOGGLE_SHOW_WORKING_SET": "إظهار الملفات العاملة",
  "CMD_TOGGLE_SHOW_FILE_TABS": "إظهار شريط علامات تبويب الملفات",
  "SPLITVIEW_INFO_TITLE": "مفتوح بالفعل",
  "SPLITVIEW_MULTIPANE_WARNING": "الملف مفتوح بالفعل في جزء آخر. سيتمكن {APP_NAME} قريبًا من فتح نفس الملف في أكثر من جزء واحد. حتى ذلك الحين، سيتم عرض الملف في الجزء الذي هو مفتوح فيه بالفعل.<br /><br />(سترى هذه الرسالة مرة واحدة فقط.)",
  "KEYBOARD_OVERLAY_TEXT": "استخدم الأسهم للتنقل، أو اكتب لتحديد عناصر واجهة المستخدم.",
  "KEYBOARD_SHORTCUT_CHANGE_TITLE": "تغيير اختصار لوحة المفاتيح…",
  "KEYBOARD_SHORTCUT_CHANGE_DIALOG_TITLE": "تغيير اختصار لوحة المفاتيح",
  "KEYBOARD_SHORTCUT_CHANGE_DIALOG_TEXT": "اضغط على تركيبة المفاتيح الجديدة لـ <b>'{0}'</b> (الحالية: <b>{1}</b>)",
  "KEYBOARD_SHORTCUT_CHANGE_DIALOG_DUPLICATE": "تحذير: تركيبة المفاتيح <b>{0}</b> معينة بالفعل إلى <b>'{1}'</b>. إعادة التعيين إلى <b>'{2}'</b>؟",
  "KEYBOARD_SHORTCUT_ASSIGN": "تعيين",
  "KEYBOARD_SHORTCUT_NONE": "بلا",
  "KEYBOARD_SHORTCUT_MENU_SHOW_SHORTCUTS": "اختصارات لوحة المفاتيح…",
  "KEYBOARD_SHORTCUT_MENU_SHOW_SHORTCUTS_BUTTON": "إظهار جميع الاختصارات…",
  "KEYBOARD_SHORTCUT_TABLE_BASE_KEY": "مفتاح الأساس",
  "KEYBOARD_SHORTCUT_TABLE_KEY_BINDING": "اختصار",
  "KEYBOARD_SHORTCUT_TABLE_COMMAND_ID": "مُعرِّف الأمر",
  "KEYBOARD_SHORTCUT_TABLE_COMMAND_NAME": "الأمر",
  "KEYBOARD_SHORTCUT_TABLE_DOUBLE_CLICK": "انقر نقرًا مزدوجًا لتغيير الاختصار",
  "KEYBOARD_SHORTCUT_TABLE_ORIGIN": "المصدر",
  "KEYBOARD_SHORTCUT_ORIG_EXTENSION": "امتداد",
  "KEYBOARD_SHORTCUT_PANEL_TITLE": "اختصارات لوحة المفاتيح",
  "KEYBOARD_SHORTCUT_PRESET_TOOLTIP": "استخدم اختصارات لوحة المفاتيح من محررات مثل VSCode أو WebStorm أو Sublime Text",
  "KEYBOARD_SHORTCUT_PRESET_SELECT": "تحديد إعدادات الاختصارات المسبقة",
  "KEYBOARD_SHORTCUT_PRESET_USING": "استخدام {0}",
  "DEFAULT": "افتراضي",
  "KEYBOARD_SHORTCUT_PANEL_FILTER": "تصفية&hellip;",
  "KEYBOARD_SHORTCUT_PANEL_RESET": "إعادة تعيين…",
  "KEYBOARD_SHORTCUT_PANEL_RESET_DEFAULT": "إعادة تعيين اختصارات لوحة المفاتيح إلى الافتراضية…",
  "KEYBOARD_SHORTCUT_RESET_DIALOG_TITLE": "إعادة تعيين اختصارات لوحة المفاتيح",
  "KEYBOARD_SHORTCUT_RESET_DIALOG_MESSAGE": "هل تريد إعادة تعيين جميع الاختصارات المخصصة إلى الافتراضية؟ لا يمكن التراجع عن هذه العملية.",
  "KEYBOARD_SHORTCUT_SRC_USER": "معرف من قبل المستخدم",
  "KEYBOARD_SHORTCUT_SRC_PRESET": "{0} إعداد مسبق",
  "STATUSBAR_CURSOR_POSITION": "السطر {0}، العمود {1}",
  "STATUSBAR_CURSOR_POSITION_SHORT": "{0} : {1}",
  "STATUSBAR_CURSOR_GOTO": "انقر للانتقال إلى سطر آخر",
  "STATUSBAR_SELECTION_CH_SINGULAR": "— تم تحديد {0} عمود",
  "STATUSBAR_SELECTION_CH_PLURAL": "— تم تحديد {0} أعمدة",
  "STATUSBAR_SELECTION_LINE_SINGULAR": "— تم تحديد {0} سطر",
  "STATUSBAR_SELECTION_LINE_PLURAL": "— تم تحديد {0} أسطر",
  "STATUSBAR_SELECTION_MULTIPLE": "— {0} تحديدات متعددة للمؤشر",
  "STATUSBAR_INDENT_TOOLTIP_SPACES": "انقر للتبديل إلى مسافات المسافة البادئة",
  "STATUSBAR_INDENT_TOOLTIP_TABS": "انقر للتبديل إلى مسافة بادئة تاب",
  "STATUSBAR_INDENT_SIZE_TOOLTIP_SPACES": "انقر لتغيير عدد المسافات المستخدمة عند المسافة البادئة",
  "STATUSBAR_INDENT_SIZE_TOOLTIP_TABS": "انقر لتغيير عرض حرف الجدولة",
  "STATUSBAR_SPACES": "المسافات:",
  "STATUSBAR_TAB_SIZE": "حجم الجدولة:",
  "STATUSBAR_AUTO_INDENT": "<span title='انقر للتبديل إلى مسافات بادئة ثابتة. مضبوط حاليًا للكشف عن المسافات البادئة وتطبيقها تلقائيًا بناءً على الملف الحالي.'>تلقائي</span>",
  "STATUSBAR_FIXED_INDENT": "<span title='انقر للتبديل إلى الكشف التلقائي عن المسافة البادئة. مضبوط حاليًا على مسافة بادئة ثابتة.'>ثابت</span>",
  "STATUSBAR_LINE_COUNT_SINGULAR": "— {0} سطر",
  "STATUSBAR_LINE_COUNT_PLURAL": "— {0} أسطر",
  "STATUSBAR_USER_EXTENSIONS_DISABLED": "الإضافات معطلة",
  "STATUSBAR_INSERT": "إدراج",
  "STATUSBAR_OVERWRITE": "استبدال",
  "STATUSBAR_INSOVR_TOOLTIP": "انقر للتبديل بين وضعي الإدراج (INS) والاستبدال (OVR) للمؤشر",
  "STATUSBAR_LANG_TOOLTIP": "انقر لتغيير نوع الملف",
  "STATUSBAR_CODE_INSPECTION_TOOLTIP": "{0}. انقر لعرض/إخفاء لوحة التقرير.",
  "STATUSBAR_DEFAULT_LANG": "(افتراضي)",
  "STATUSBAR_SET_DEFAULT_LANG": "تعيين كافتراضي لملفات ‎.{0}‎",
  "STATUSBAR_ENCODING_TOOLTIP": "حدد الترميز",
  "STATUSBAR_TASKS": "المهام",
  "STATUSBAR_TASKS_TOOLTIP": "إدارة المهام النشطة",
  "STATUSBAR_TASKS_HIDE_SPINNER": "إخفاء أيقونة التحميل",
  "STATUSBAR_TASKS_UNKNOWN_EXTENSION_TASK": "مهمة ملحق غير معروفة…",
  "STATUSBAR_TASKS_PLAY": "بدء أو استئناف",
  "STATUSBAR_TASKS_PAUSE": "إيقاف مؤقت",
  "STATUSBAR_TASKS_STOP": "إيقاف",
  "STATUSBAR_TASKS_RESTART": "إعادة تشغيل",
  "CLOSE_TABS_TO_THE_RIGHT": "إغلاق علامات التبويب على اليمين",
  "CLOSE_TABS_TO_THE_LEFT": "إغلاق علامات التبويب على اليسار",
  "CLOSE_ALL_TABS": "إغلاق جميع علامات التبويب",
  "CLOSE_SAVED_TABS": "إغلاق علامات التبويب المحفوظة",
  "ERRORS_NO_FILE": "لا يوجد ملف مفتوح",
  "ERRORS_PANEL_TITLE_MULTIPLE": "{0} مشاكل - {1}",
  "ERRORS_PANEL_TITLE_MULTIPLE_FIXABLE": "{0} مشاكل، {1} قابلة للإصلاح - {2}",
  "SINGLE_ERROR": "مشكلة {0} واحدة - {1}",
  "SINGLE_ERROR_FIXABLE": "مشكلة {0} واحدة، {1} قابلة للإصلاح - {2}",
  "MULTIPLE_ERRORS": "{0} {1} مشاكل - {2}",
  "MULTIPLE_ERRORS_FIXABLE": "{0} {1} مشاكل، {2} قابلة للإصلاح - {3}",
  "NO_ERRORS": "لم يتم العثور على أي مشاكل في {0} - أحسنت!",
  "NO_ERRORS_MULTIPLE_PROVIDER": "لم يتم العثور على أي مشاكل - أحسنت!",
  "LINT_DISABLED": "تم تعطيل الفحص",
  "NO_LINT_AVAILABLE": "لا يوجد مدقق متاح لـ {0}",
  "NOTHING_TO_LINT": "لا يوجد شيء للفحص",
  "COPY_ERROR": "نسخ المشكلة",
  "FIX": "إصلاح",
  "CANNOT_FIX_TITLE": "فشل تطبيق الإصلاح",
  "CANNOT_FIX_SOME_TITLE": "فشل تطبيق بعض الإصلاحات",
  "CANNOT_FIX_MESSAGE": "تم تعديل المستند منذ إعداد الإصلاح. يُرجى المحاولة مرة أخرى.",
  "LINTER_TIMED_OUT": "{0} انتهى وقته بعد انتظار {1} ميلي ثانية",
  "LINTER_FAILED": "{0} انتهى مع الخطأ: {1}",
  "CLICK_VIEW_PROBLEM": "انقر لعرض المشكلة في اللوحة",
  "FILE_MENU": "ملف",
  "CMD_FILE_NEW_UNTITLED": "جديد",
  "CMD_FILE_NEW": "ملف جديد",
  "CMD_FILE_DUPLICATE": "تكرار",
  "CMD_FILE_DUPLICATE_FILE": "تكرار الملف",
  "CMD_FILE_DOWNLOAD_PROJECT": "تنزيل المشروع",
  "CMD_FILE_DOWNLOAD": "تنزيل",
  "CMD_FILE_CUT": "قص",
  "CMD_FILE_COPY": "نسخ",
  "CMD_FILE_COPY_PATH": "نسخ المسار",
  "CMD_FILE_PASTE": "لصق",
  "CMD_PROJECT_NEW": "بدء مشروع…",
  "CMD_FILE_NEW_FOLDER": "مجلد جديد",
  "CMD_FILE_OPEN": "فتح ملفات…",
  "CMD_RECENT_FILES_OPEN": "الملفات الحديثة…",
  "CMD_ADD_TO_WORKING_SET": "فتح في مجموعة العمل",
  "CMD_OPEN_DROPPED_FILES": "فتح الملفات المسحوبة",
  "CMD_OPEN_FOLDER": "فتح مجلد…",
  "CMD_FILE_CLOSE": "إغلاق",
  "CMD_FILE_CLOSE_ALL": "إغلاق الكل",
  "CMD_REOPEN_CLOSED": "إعادة فتح الملف المغلق",
  "CMD_FILE_CLOSE_LIST": "إغلاق القائمة",
  "CMD_FILE_CLOSE_OTHERS": "إغلاق البقية",
  "CMD_FILE_CLOSE_ABOVE": "إغلاق ما في الأعلى",
  "CMD_FILE_CLOSE_BELOW": "إغلاق ما في الأسفل",
  "CMD_FILE_SAVE": "حفظ الملف",
  "CMD_FILE_SAVE_ALL": "حفظ الكل",
  "CMD_FILE_SAVE_AS": "حفظ باسم…",
  "CMD_LIVE_FILE_PREVIEW": "معاينة مباشرة",
  "CMD_LIVE_FILE_PREVIEW_SETTINGS": "إعدادات المعاينة المباشرة",
  "CMD_TOGGLE_LIVE_PREVIEW_MB_MODE": "تفعيل المعاينة المباشرة التجريبية",
  "CMD_RELOAD_LIVE_PREVIEW": "إعادة تحميل المعاينة المباشرة",
  "CMD_PROJECT_SETTINGS": "إعدادات المشروع…",
  "CMD_FILE_RENAME": "إعادة تسمية",
  "CMD_FILE_DELETE": "حذف",
  "CMD_INSTALL_EXTENSION": "تثبيت ملحق…",
  "CMD_EXTENSION_MANAGER": "إدارة الملحقات…",
  "CMD_FILE_REFRESH": "تحديث شجرة الملفات",
  "CMD_FILE_SHOW_FOLDERS_FIRST": "فرز المجلدات أولاً",
  "CMD_QUIT": "إنهاء",
  "CMD_OPEN_IN": "فتح في",
  "CMD_EXIT": "خروج",
  "EDIT_MENU": "تعديل",
  "CMD_UNDO": "تراجع",
  "CMD_REDO": "إعادة",
  "CMD_CUT": "قص",
  "CMD_COPY": "نسخ",
  "CMD_PASTE": "لصق",
  "CMD_SELECT_ALL": "تحديد الكل",
  "CMD_SELECT_LINE": "تحديد السطر",
  "CMD_SPLIT_SEL_INTO_LINES": "تقسيم التحديد إلى أسطر",
  "CMD_ADD_CUR_TO_NEXT_LINE": "إضافة مؤشر إلى السطر التالي",
  "CMD_ADD_CUR_TO_PREV_LINE": "إضافة مؤشر إلى السطر السابق",
  "CMD_INDENT": "مسافة بادئة",
  "CMD_UNINDENT": "إزالة المسافة البادئة",
  "CMD_DUPLICATE": "تكرار",
  "CMD_DELETE_LINES": "حذف السطر",
  "CMD_COMMENT": "تبديل تعليق السطر",
  "CMD_BLOCK_COMMENT": "تبديل تعليق الكتلة",
  "CMD_LINE_UP": "نقل السطر لأعلى",
  "CMD_LINE_DOWN": "نقل السطر لأسفل",
  "CMD_OPEN_LINE_ABOVE": "فتح سطر أعلاه",
  "CMD_OPEN_LINE_BELOW": "فتح سطر أدناه",
  "CMD_TOGGLE_CLOSE_BRACKETS": "إغلاق الأقواس تلقائيًا",
  "CMD_SHOW_CODE_HINTS": "إظهار تلميحات الشفرة",
  "CMD_BEAUTIFY_CODE": "تنسيق الشفرة",
  "CMD_BEAUTIFY_CODE_ON_SAVE": "تنسيق الشفرة بعد الحفظ",
  "CMD_AUTO_RENAME_TAGS": "إعادة تسمية وسوم HTML تلقائيًا",
  "CMD_TOGGLE_EMMET": "إيميت",
  "FIND_MENU": "بحث",
  "CMD_FIND": "بحث",
  "CMD_FIND_NEXT": "البحث التالي",
  "CMD_FIND_PREVIOUS": "البحث السابق",
  "CMD_FIND_ALL_AND_SELECT": "تحديد جميع النتائج",
  "CMD_ADD_NEXT_MATCH": "إضافة النتيجة التالية",
  "CMD_SKIP_CURRENT_MATCH": "تخطي وإضافة النتيجة التالية",
  "CMD_FIND_IN_FILES": "بحث في الملفات",
  "CMD_FIND_IN_SUBTREE": "بحث في...",
  "CMD_REPLACE": "استبدال",
  "CMD_REPLACE_IN_FILES": "استبدال في الملفات",
  "CMD_REPLACE_IN_SUBTREE": "استبدال في...",
  "VIEW_MENU": "عرض",
  "CMD_HIDE_SIDEBAR": "إخفاء الشريط الجانبي",
  "CMD_SHOW_SIDEBAR": "إظهار الشريط الجانبي",
  "CMD_TOGGLE_SIDEBAR": "تبديل الشريط الجانبي",
  "CMD_TOGGLE_TABBAR": "شريط تبويب الملف",
  "CMD_TOGGLE_PANELS": "تبديل الألواح",
  "CMD_TOGGLE_PURE_CODE": "بدون تشتيت",
  "CMD_TOGGLE_FULLSCREEN": "ملء الشاشة",
  "CMD_ZOOM_UI": "تكبير/تصغير واجهة المستخدم والخطوط",
  "CMD_ZOOM_IN": "تكبير",
  "CMD_ZOOM_IN_SCALE": "تكبير (الحالي: {0}%)",
  "CMD_ZOOM_OUT": "تصغير",
  "CMD_INCREASE_FONT_SIZE": "زيادة حجم الخط",
  "CMD_DECREASE_FONT_SIZE": "تصغير حجم الخط",
  "CMD_RESTORE_FONT_SIZE": "استعادة حجم الخط",
  "CMD_SCROLL_LINE_UP": "تمرير سطر لأعلى",
  "CMD_SCROLL_LINE_DOWN": "تمرير سطر لأسفل",
  "CMD_TOGGLE_LINE_NUMBERS": "أرقام الأسطر",
  "CMD_TOGGLE_ACTIVE_LINE": "تمييز السطر النشط",
  "CMD_TOGGLE_WORD_WRAP": "التفاف النص",
  "CMD_VIEW_TOGGLE_INSPECTION": "فحص الملفات عند الحفظ",
  "CMD_VIEW_TOGGLE_PROBLEMS": "المشاكل",
  "CMD_WORKINGSET_SORT_BY_ADDED": "ترتيب حسب تاريخ الإضافة",
  "CMD_WORKINGSET_SORT_BY_NAME": "ترتيب حسب الاسم",
  "CMD_WORKINGSET_SORT_BY_TYPE": "ترتيب حسب النوع",
  "CMD_WORKING_SORT_TOGGLE_AUTO": "ترتيب تلقائي",
  "CMD_THEMES": "سمات…",
  "CMD_TOGGLE_SEARCH_AUTOHIDE": "إغلاق البحث تلقائيًا",
  "CMD_TOGGLE_RULERS": "المساطر",
  "CMD_TOGGLE_INDENT_GUIDES": "خطوط دليل المسافة البادئة",
  "CMD_KEYBOARD_NAV_OVERLAY": "لوحة الأوامر المرئية",
  "NAVIGATE_MENU": "تصفح",
  "CMD_QUICK_OPEN": "فتح سريع",
  "CMD_GOTO_LINE": "الانتقال إلى السطر",
  "CMD_GOTO_DEFINITION": "بحث سريع عن التعريف",
  "CMD_GOTO_DEFINITION_PROJECT": "بحث سريع عن التعريف في المشروع",
  "CMD_GOTO_FIRST_PROBLEM": "الانتقال إلى أول مشكلة",
  "CMD_GOTO_NEXT_PROBLEM": "الانتقال إلى المشكلة التالية",
  "CMD_GOTO_PREV_PROBLEM": "الانتقال إلى المشكلة السابقة",
  "CMD_TOGGLE_QUICK_EDIT": "تعديل سريع",
  "CMD_TOGGLE_QUICK_DOCS": "وثائق سريعة",
  "CMD_QUICK_EDIT_PREV_MATCH": "العنصر السابق في التعديل السريع",
  "CMD_QUICK_EDIT_NEXT_MATCH": "العنصر التالي في التحرير السريع",
  "CMD_CSS_QUICK_EDIT_NEW_RULE": "قاعدة جديدة",
  "CMD_NEXT_DOC": "المستند التالي",
  "CMD_PREV_DOC": "المستند السابق",
  "CMD_NAVIGATE_BACKWARD": "الرجوع للخلف",
  "CMD_NAVIGATE_FORWARD": "التقدم للأمام",
  "CMD_NEXT_DOC_LIST_ORDER": "المستند التالي في القائمة",
  "CMD_PREV_DOC_LIST_ORDER": "المستند السابق في القائمة",
  "CMD_SHOW_IN_TREE": "إظهار في شجرة الملفات",
  "CMD_SHOW_IN_EXPLORER": "مستكشف ملفات Windows",
  "CMD_SHOW_IN_FINDER": "مُستكشف ماك",
  "CMD_SHOW_IN_FILE_MANAGER": "مُدير الملفات",
  "CMD_OPEN_IN_CMD": "موجه الأوامر",
  "CMD_OPEN_IN_POWER_SHELL": "PowerShell",
  "CMD_OPEN_IN_DEFAULT_APP": "تطبيق النظام الافتراضي",
  "CMD_SWITCH_PANE_FOCUS": "تبديل تركيز الجزء",
  "CMD_OPEN_VFS": "فتح نظام الملفات الافتراضي",
  "CMD_DIAGNOSTIC_TOOLS": "أدوات تشخيص {APP_NAME}",
  "CMD_EXPERIMENTAL_FEATURES": "الميزات التجريبية",
  "CMD_ENABLE_DRAG_AND_DROP": "اسحب وأفلت الملفات",
  "CMD_OPEN_EXTENSIONS_FOLDER": "فتح مجلد الإضافات…",
  "CMD_OPEN_VIRTUAL_SERVER": "فتح الخادم الافتراضي",
  "HELP_MENU": "مساعدة",
  "CMD_CHECK_FOR_UPDATE": "التحقق من وجود تحديثات…",
  "CMD_AUTO_UPDATE": "التحديث التلقائي",
  "CMD_HOW_TO_USE_BRACKETS": "كيفية استخدام {APP_NAME}",
  "CMD_SUPPORT": "دعم {APP_NAME}",
  "CMD_GET_PRO": "احصل على Phoenix Pro",
  "CMD_VIEW_LICENSE": "عرض الرخصة",
  "CMD_MANAGE_LICENSES": "إدارة التراخيص",
  "CMD_USER_PROFILE": "حساب {APP_NAME}",
  "CMD_DOCS": "مساعدة، البدء",
  "CMD_SUGGEST": "اقتراح ميزة",
  "CMD_REPORT_ISSUE": "الإبلاغ عن مشكلة",
  "CMD_RELEASE_NOTES": "ملاحظات الإصدار",
  "CMD_GET_INVOLVED": "المشاركة",
  "CMD_SHOW_EXTENSIONS_FOLDER": "إظهار مجلد الإضافات",
  "CMD_HEALTH_DATA_STATISTICS": "تقرير الحالة…",
  "CMD_HOMEPAGE": "تنزيل التطبيقات - الصفحة الرئيسية",
  "CMD_TWITTER": "{TWITTER_NAME} على تويتر",
  "CMD_YOUTUBE": "قناة يوتيوب",
  "CMD_ABOUT": "حول {APP_TITLE}",
  "CMD_OPEN_PREFERENCES": "فتح ملف التفضيلات",
  "CMD_OPEN_KEYMAP": "فتح ملف خريطة مفاتيح المستخدم",
  "EXPERIMENTAL_BUILD": "إصدار تجريبي",
  "RELEASE_BUILD": "إصدار",
  "DEVELOPMENT_BUILD": "إصدار تطوير",
  "PRERELEASE_BUILD": "إصدار تجريبي مسبق",
  "RELOAD_FROM_DISK": "إعادة التحميل من القرص",
  "KEEP_CHANGES_IN_EDITOR": "الاحتفاظ بالتغييرات في المحرر",
  "CLOSE_DONT_SAVE": "إغلاق (بدون حفظ)",
  "RELAUNCH_CHROME": "إعادة تشغيل Chrome",
  "ABOUT": "حول",
  "CLOSE": "إغلاق",
  "ABOUT_TEXT_LINE1": "إصدار {VERSION_MAJOR}.{VERSION_MINOR} {BUILD_TYPE} {VERSION}",
  "ABOUT_TEXT_BUILD_TIMESTAMP": "وقت بناء الإصدار:",
  "ABOUT_TEXT_PRO_BUILD": "إصدار Phoenix Pro:",
  "ABOUT_RELEASE_CREDITS": "جهات الإصدار:",
  "ABOUT_TEXT_LINE3": "مكتبات الطرف الثالث التي نستخدمها - <a href='https://github.com/phcode-dev/phoenix/tree/main/src/thirdparty/licences'> التراخيص والإسنادات</a> .",
  "ABOUT_TEXT_LINE4": "الوثائق والمصدر في <a href='https://github.com/phcode-dev/phoenix/'>https://github.com/phcode-dev/phoenix/</a>",
  "ABOUT_TEXT_LINE5": "مصنوع بحب ❤ وجافاسكريبت بواسطة:",
  "ABOUT_TEXT_LINE6": "العديد من الأشخاص (لكننا نواجه مشكلة في تحميل تلك البيانات الآن).",
  "ABOUT_TEXT_MDN_DOCS": "وثائق MDN وشعار MDN الرسومي مرخصة بموجب ترخيص المشاع الإبداعي، <a href='{MDN_DOCS_LICENSE}'>CC-BY-SA 2.5 Unported</a>.",
  "UPDATE_NOTIFICATION_TOOLTIP": "هناك إصدار جديد من {APP_NAME} متاح! انقر هنا للمزيد من التفاصيل.",
  "UPDATE_NOT_AVAILABLE_TITLE": "{APP_NAME} مُحدّث",
  "UPDATE_UP_TO_DATE": "إصدارك من {APP_NAME} هو الأحدث!",
  "UPDATE_AVAILABLE_TITLE": "تحديث متوفر",
  "UPDATE_WHATS_NEW": "الجديد في {APP_NAME}",
  "UPDATE_READY_RESTART_TITLE": "أعد تشغيل التطبيق للتحديث",
  "UPDATE_READY_RESTART_INSTALL_MESSAGE": "سيتم تحديث {APP_NAME} تلقائيًا عند إغلاق جميع النوافذ المفتوحة.",
  "UPDATE_FAILED_TITLE": "فشل التحديث",
  "UPDATE_INSTALLING": "جارٍ تثبيت التحديث…",
  "UPDATE_INSTALLING_MESSAGE": "التحديث قيد التثبيت: {APP_NAME} يقوم حاليًا بتثبيت آخر التحديثات. سيتم إغلاق التطبيق تلقائيًا بمجرد اكتمال التثبيت.",
  "UPDATE_FAILED_MESSAGE": "يُرجى إغلاق جميع نوافذ تطبيق {APP_NAME} وإعادة فتح التطبيق لمحاولة التحديث مرة أخرى. <br/> يمكنك أيضًا تثبيت التحديث عن طريق تنزيل مُثبّت البرنامج من <a href='https://phcode.io'>phcode.io</a>",
  "UPDATE_FAILED_VISIT_SITE_MESSAGE": "لإعادة المحاولة، يُرجى إغلاق جميع مثيلات {APP_NAME} وإعادة تشغيل التطبيق. <br>ستتم إعادة توجيهك إلى صفحة التنزيل الخاصة بنا قريبًا، حيث يمكنك تنزيل أحدث إصدار يدويًا.",
  "UPDATE_MESSAGE": "مرحبًا، هناك إصدار جديد من {APP_NAME} متاح. إليك بعض الميزات الجديدة:",
  "GET_IT_NOW": "احصل عليه الآن!",
  "UPDATE_ON_EXIT": "تحديث عند الخروج",
  "UPDATE_LATER": "ذكّرني لاحقًا",
  "UPDATE_DONE": "إعادة التشغيل لتحديث {APP_NAME}",
  "UPDATE_RESTART_INSTALL": "إعادة التشغيل لتثبيت التحديثات",
  "UPDATE_DOWNLOADING": "جارٍ تنزيل مُثبّت البرنامج",
  "INSTALL_WEBAPP": "ثبّت {APP_NAME} على جهازك",
  "UPDATE_DOWNLOAD_PROGRESS": "جارٍ التنزيل - {0} من {1} ميجابايت",
  "UPDATING_APP": "جارٍ تحديث {APP_NAME}",
  "UPDATING_APP_MESSAGE": "قد يستغرق هذا بعض الوقت",
  "UPDATING_APP_DIALOG_MESSAGE": "التحديث قيد التقدم. يمكنك متابعة استخدام {APP_NAME} أثناء الترقية.",
  "PROJECT_SETTINGS_TITLE": "إعدادات المشروع لـ: {0}",
  "PROJECT_SETTING_BASE_URL": "عنوان URL أساسي للمعاينة المباشرة",
  "PROJECT_SETTING_BASE_URL_HINT": "لاستخدام خادم محلي، أدخل عنوان URL مثل http://localhost:8000/",
  "BASEURL_ERROR_INVALID_PROTOCOL": "البروتوكول {0} غير مدعوم من قبل المعاينة المباشرة — يرجى استخدام http: أو https: .",
  "BASEURL_ERROR_SEARCH_DISALLOWED": "لا يمكن أن يحتوي عنوان URL الأساسي على معلمات بحث مثل \"{0}\".",
  "BASEURL_ERROR_HASH_DISALLOWED": "لا يمكن أن يحتوي عنوان URL الأساسي على رموز تصنيف مثل \"{0}\".",
  "BASEURL_ERROR_INVALID_CHAR": "يجب ترميز الأحرف الخاصة مثل '{0}' باستخدام %.",
  "BASEURL_ERROR_UNKNOWN_ERROR": "خطأ غير معروف في تحليل عنوان URL الأساسي",
  "EMPTY_VIEW_HEADER": "<em>افتح ملفًا بينما تملك هذه اللوحة التركيز</em>",
  "FLIPVIEW_BTN_TOOLTIP": "اقلب هذه الشاشة إلى لوحة {0}",
  "CURRENT_THEME": "السمة الحالية",
  "GET_MORE_THEMES": "الحصول على المزيد...",
  "USE_THEME_SCROLLBARS": "استخدام أشرطة تمرير السمة",
  "FONT_SIZE": "حجم الخط",
  "FONT_FAMILY": "عائلة الخطوط",
  "FONT_LINE_HEIGHT": "ارتفاع السطر",
  "THEMES_SETTINGS": "إعدادات السمات",
  "THEMES_ERROR": "خطأ في السمات",
  "THEMES_ERROR_CANNOT_APPLY": "تعذر تطبيق السمة بسبب خطأ.",
  "BUTTON_NEW_RULE": "قاعدة جديدة",
  "INSTALL": "تثبيت",
  "APPLY": "تطبيق",
  "UPDATE": "تحديث",
  "REMOVE": "إزالة",
  "DISABLE": "تعطيل",
  "ENABLE": "تفعيل",
  "OVERWRITE": "استحواذ/كتابة فوق",
  "CANT_DROP_ZIP": "سيتم دعم إسقاط ملفات zip قريبًا...",
  "CANT_REMOVE_DEV": "يجب حذف الإضافات الموجودة في مجلد \"dev\" يدويًا.",
  "CANT_UPDATE": "التحديث غير متوافق مع هذا الإصدار من {APP_NAME}.",
  "CANT_UPDATE_DEV": "لا يمكن تحديث الإضافات الموجودة في مجلد \"dev\" تلقائيًا.",
  "INSTALL_EXTENSION_TITLE": "تثبيت إضافة",
  "UPDATE_EXTENSION_TITLE": "تحديث إضافة",
  "INSTALL_EXTENSION_LABEL": "رابط الإضافة",
  "INSTALL_EXTENSION_HINT": "رابط ملف zip أو مستودع GitHub الخاص بالإضافة",
  "INSTALLING_FROM": "جارٍ تثبيت الإضافة من {0}…",
  "INSTALL_SUCCEEDED": "تم التثبيت بنجاح!",
  "INSTALL_FAILED": "فشل التثبيت.",
  "CANCELING_INSTALL": "جارٍ الإلغاء…",
  "CANCELING_HUNG": "يستغرق إلغاء التثبيت وقتًا طويلاً. قد يكون هناك خطأ داخلي.",
  "INSTALL_CANCELED": "تم إلغاء التثبيت.",
  "VIEW_COMPLETE_DESCRIPTION": "عرض الوصف الكامل",
  "VIEW_TRUNCATED_DESCRIPTION": "عرض الوصف المختصر",
  "SORT_EXTENSION_METHOD": "فرز الملحقات باستخدام عدد التنزيلات أو تاريخ النشر",
  "INVALID_ZIP_FILE": "المحتوى الذي تم تنزيله ليس ملف zip صالحًا.",
  "MISSING_PACKAGE_JSON": "لا يحتوي الحِزْمَة على ملف package.json.",
  "INVALID_PACKAGE_JSON": "ملف package.json غير صالح (الخطأ هو: {0}).",
  "MISSING_PACKAGE_NAME": "ملف package.json لا يحدد اسم حِزْمَة.",
  "BAD_PACKAGE_NAME": "`{0}` اسم حزمة غير صالح.",
  "MISSING_PACKAGE_VERSION": "ملف package.json لا يحدد إصدار الحزمة.",
  "INVALID_VERSION_NUMBER": "رقم إصدار الحزمة ({0}) غير صالح.",
  "INVALID_BRACKETS_VERSION": "سلسلة توافق {APP_NAME} ({0}) غير صالحة.",
  "DISALLOWED_WORDS": "الكلمات ({1}) غير مسموح بها في حقل {0}.",
  "NPM_INSTALL_FAILED": "فشل أمر npm install: {0}",
  "API_NOT_COMPATIBLE": "الملحق غير متوافق مع هذا الإصدار من {APP_NAME}. إنه مثبت في مجلد الملحقات المعطلة لديك.",
  "MISSING_MAIN": "الحزمة لا تحتوي على ملف main.js.",
  "EXTENSION_ALREADY_INSTALLED": "سيؤدي تثبيت هذه الحزمة إلى الكتابة فوق ملحق مثبت مسبقًا. هل تريد الكتابة فوق الملحق القديم؟",
  "EXTENSION_SAME_VERSION": "هذه الحزمة هي نفس إصدار الحزمة المثبتة حاليًا. هل تريد الكتابة فوق التثبيت الحالي؟",
  "EXTENSION_OLDER_VERSION": "إصدار هذه الحزمة هو {0} وهو أقدم من الإصدار المثبت حاليًا ({1}). هل تريد استبدال التثبيت الحالي؟",
  "DOWNLOAD_ID_IN_USE": "خطأ داخلي: معرف التنزيل قيد الاستخدام بالفعل.",
  "NO_SERVER_RESPONSE": "لا يمكن الاتصال بالخادم.",
  "BAD_HTTP_STATUS": "الملف غير موجود على الخادم (HTTP {0}).",
  "CANNOT_WRITE_TEMP": "تعذر حفظ التنزيل إلى ملف مؤقت.",
  "ERROR_LOADING": "واجهت الإضافة خطأً أثناء بدء التشغيل.",
  "MALFORMED_URL": "عنوان URL غير صالح. يرجى التحقق من إدخاله بشكل صحيح.",
  "UNSUPPORTED_PROTOCOL": "يجب أن يكون عنوان URL بتنسيق http أو https.",
  "UNKNOWN_ERROR": "خطأ داخلي غير معروف.",
  "EXTENSION_VERIFIED_PUBLISHER": "تحقق هذا الناشر من ملكيته لـ {0}",
  "EXTENSION_VERIFIED_SORT": "مُوَثَّق",
  "EXTENSION_STAR": "نجمة",
  "EXTENSION_STAR_SORT": "تقييم النجوم",
  "ERROR_UNINSTALLING_EXTENSION_TITLE": "خطأ في إلغاء تثبيت الملحق",
  "ERROR_UNINSTALLING_EXTENSION_MESSAGE": "فشل إلغاء تثبيت الملحق {0}",
  "EXTENSION_MANAGER_TITLE": "مدير الإضافات",
  "EXTENSION_MANAGER_ERROR_LOAD": "تعذر الوصول إلى سجل الإضافات. يُرجى المحاولة مرة أخرى لاحقًا.",
  "EXTENSION_UPDATE_RESTART_TITLE": "إعادة التشغيل للتحديث",
  "EXTENSION_UPDATE_RESTART_MESSAGE": "لتحميل الإضافات المُحدَّثة، يُرجى إغلاق جميع النسخ المُشغَّلة من {APP_NAME} وإعادة تشغيل التطبيق.",
  "INSTALL_EXTENSION_DRAG": "اسحب ملف .zip هنا أو",
  "INSTALL_EXTENSION_DROP": "أفلِت ملف .zip للتثبيت",
  "INSTALL_EXTENSION_DROP_ERROR": "تم إيقاف التثبيت/التحديث بسبب الأخطاء التالية:",
  "INSTALL_FROM_URL": "التثبيت من رابط…",
  "INSTALL_EXTENSION_VALIDATING": "جارٍ التحقق…",
  "EXTENSION_AUTHOR": "المؤلف",
  "EXTENSION_DATE": "التاريخ",
  "EXTENSION_INCOMPATIBLE_NEWER": "تتطلب هذه الإضافة إصدارًا أحدث من {APP_NAME}.",
  "EXTENSION_INCOMPATIBLE_OLDER": "تعمل هذه الإضافة حاليًا فقط مع الإصدارات القديمة من {APP_NAME}.",
  "EXTENSION_DEFAULT_FEATURE_PRESENT": "قد لا تحتاج إلى هذه الإضافة. {APP_NAME} يمتلك هذه الميزة بالفعل.",
  "EXTENSION_DEPRECATED_NOT_LOADED": "لم يتم تحميل الملحق. إنه إما مهمل أو غير آمن.",
  "EXTENSION_LATEST_INCOMPATIBLE_NEWER": "الإصدار {0} من هذه الإضافة يتطلب إصدارًا أحدث من {APP_NAME}. ولكن يمكنك تثبيت الإصدار السابق {1}.",
  "EXTENSION_LATEST_INCOMPATIBLE_OLDER": "الإصدار {0} من هذه الإضافة يعمل فقط مع الإصدارات القديمة من {APP_NAME}. ولكن يمكنك تثبيت الإصدار السابق {1}.",
  "EXTENSION_NO_DESCRIPTION": "لا يوجد وصف",
  "EXTENSION_MORE_INFO": "المزيد من المعلومات…",
  "EXTENSION_ERROR": "خطأ في الملحق",
  "EXTENSION_KEYWORDS": "كلمات مفتاحية",
  "EXTENSION_TRANSLATED_USER_LANG": "مُترجم إلى {0} لغة، بما في ذلك لغتك",
  "EXTENSION_TRANSLATED_GENERAL": "مُترجم إلى {0} لغة",
  "EXTENSION_TRANSLATED_LANGS": "تمت ترجمة هذا الملحق إلى اللغات التالية: {0}",
  "EXTENSION_INSTALLED": "مُثبّت",
  "EXTENSION_UPDATE_INSTALLED": "تم تنزيل تحديث هذا الملحق وسيتم تثبيته بعد إعادة تحميل {APP_NAME}.",
  "EXTENSION_SEARCH_PLACEHOLDER": "بحث",
  "EXTENSION_MORE_INFO_LINK": "المزيد",
  "EXTENSION_MANAGER_CREATE_EXTENSION": "+ إنشاء إضافة",
  "EXTENSION_MANAGER_CREATE_THEME": "+ إنشاء سمة",
  "BROWSE_EXTENSIONS": "استعراض الإضافات",
  "EXTENSION_MANAGER_REMOVE": "إزالة إضافة",
  "EXTENSION_MANAGER_REMOVE_ERROR": "تعذر إزالة إضافة واحدة أو أكثر: {0}. سيتم إعادة تحميل {APP_NAME}.",
  "EXTENSION_MANAGER_UPDATE": "تحديث إضافة",
  "EXTENSION_MANAGER_UPDATE_ERROR": "تعذر تحديث إضافة واحدة أو أكثر: {0}. سيتم إعادة تحميل {APP_NAME}.",
  "EXTENSION_MANAGER_DISABLE": "تعطيل إضافة",
  "EXTENSION_MANAGER_DISABLE_ERROR": "تعذر تعطيل إضافة واحدة أو أكثر: {0}. سيتم إعادة تحميل {APP_NAME}.",
  "EXTENSION_MANAGER_THEMES_INFO": "<a class=\"theme_settings\">للإنتقال إلى إعدادات السمات</a> أو تعديل إعدادات سمة أخرى، <a class=\"theme_settings\">انقر هنا</a>.",
  "EXTENSION_MANAGER_THEMES_UNDO": "الرجوع إلى المظهر السابق",
  "MARKED_FOR_REMOVAL": "مُعَلَّم للإزالة",
  "UNDO_REMOVE": "تراجع",
  "MARKED_FOR_UPDATE": "مُعَلَّم للتحديث",
  "UNDO_UPDATE": "تراجع",
  "MARKED_FOR_DISABLING": "مُعَلَّم للتعطيل",
  "UNDO_DISABLE": "تراجع",
  "CHANGE_AND_RELOAD_TITLE": "تغيير الإضافات",
  "CHANGE_AND_RELOAD_MESSAGE": "لتحديث أو إزالة أو تعطيل الإضافات المُعَلَّمة، سيحتاج {APP_NAME} إلى إعادة التحميل. سيُطلب منك حفظ التغييرات غير المحفوظة.",
  "REMOVE_AND_RELOAD": "إزالة الإضافات وإعادة التحميل",
  "CHANGE_AND_RELOAD": "تغيير الملحقات وإعادة التحميل",
  "UPDATE_AND_RELOAD": "تحديث الملحقات وإعادة التحميل",
  "DISABLE_AND_RELOAD": "تعطيل الملحقات وإعادة التحميل",
  "PROCESSING_EXTENSIONS": "جارٍ معالجة تغييرات الملحقات…",
  "EXTENSION_NOT_INSTALLED": "تعذر إزالة الملحق {0} لأنه لم يكن مثبتًا.",
  "NO_EXTENSIONS": "لم يتم تثبيت أي ملحقات حتى الآن.<br>انقر فوق علامة التبويب \"المتوفرة\" أعلاه للبدء.",
  "NO_EXTENSION_MATCHES": "لا توجد ملحقات تطابق بحثك.",
  "REGISTRY_SANITY_CHECK_WARNING": "ملاحظة: قد تأتي هذه الملحقات من مؤلفين مختلفين عن {APP_NAME} نفسه. لا تتم مراجعة الملحقات ولديها امتيازات محلية كاملة. توخ الحذر عند تثبيت ملحقات من مصدر غير معروف.",
  "EXTENSIONS_INSTALLED_TITLE": "مثبتة",
  "EXTENSIONS_DEFAULT_TITLE": "افتراضية",
  "EXTENSIONS_AVAILABLE_TITLE": "المتوفرة",
  "EXTENSIONS_THEMES_TITLE": "السِمات",
  "EXTENSIONS_UPDATES_TITLE": "التحديثات",
  "EXTENSIONS_LAST_UPDATED": "آخر تحديث",
  "EXTENSIONS_DOWNLOADS": "التنزيلات",
  "EXTENSIONS_REGISTRY_TASK_TITLE": "تحديث قائمة الإضافات",
  "EXTENSIONS_REGISTRY_TASK_MESSAGE": "جارٍ التنزيل…",
  "INLINE_EDITOR_NO_MATCHES": "لا توجد نتائج مطابقة.",
  "INLINE_EDITOR_HIDDEN_MATCHES": "جميع النتائج مطوية. قم بتوسيع الملفات المدرجة على اليمين لعرض النتائج المطابقة.",
  "CSS_QUICK_EDIT_NO_MATCHES": "لا توجد قواعد CSS حالية تتطابق مع اختيارك.<br> انقر فوق \"إنشاء قاعدة\" لإنشاء واحدة.",
  "CSS_QUICK_EDIT_NO_STYLESHEETS": "لا توجد أوراق أنماط في مشروعك.<br>أنشئ واحدة لإضافة قواعد CSS.",
  "IMAGE_VIEWER_LARGEST_ICON": "الأكبر",
  "UNIT_PIXELS": "بكسل",
  "DEBUG_MENU": "تصحيح الأخطاء",
  "ERRORS": "أخطاء",
  "CMD_SHOW_DEV_TOOLS": "{APP_NAME} أدوات المطور",
  "CMD_REFRESH_WINDOW": "إعادة التحميل مع الإضافات",
  "CMD_LOAD_CURRENT_EXTENSION": "تحميل المشروع كإضافة",
  "CMD_RELOAD_CURRENT_EXTENSION": "إعادة تحميل المشروع كإضافة",
  "CMD_UNLOAD_CURRENT_EXTENSION": "إلغاء تحميل المشروع كإضافة",
  "CMD_RELOAD_WITHOUT_USER_EXTS": "إعادة التحميل بدون إضافات",
  "CMD_NEW_BRACKETS_WINDOW": "نافذة جديدة",
  "CMD_LAUNCH_SCRIPT_MAC": "تثبيت اختصار سطر الأوامر",
  "CMD_SWITCH_LANGUAGE": "تبديل اللغة…",
  "CMD_RUN_UNIT_TESTS": "تشغيل اختبارات {APP_NAME}",
  "CMD_BUILD_TESTS": "بناء اختبارات المحرر",
  "CMD_SHOW_PERF_DATA": "إظهار بيانات الأداء",
  "CMD_ENABLE_LOGGING": "تفعيل السجلات التفصيلية",
  "CMD_ENABLE_PHNODE_INSPECTOR": "تفعيل مُفحّص PhNode",
  "CMD_GET_PHNODE_INSPECTOR_URL": "كيفية فحص PhNode",
  "CMD_ENABLE_LIVE_PREVIEW_LOGS": "سجلات المعاينة المباشرة",
  "CMD_ENABLE_GIT_LOGS": "سجلات Git التفصيلية",
  "CMD_OPEN_BRACKETS_SOURCE": "فتح مصدر {APP_NAME}",
  "CREATING_LAUNCH_SCRIPT_TITLE": "اختصار سطر أوامر {APP_NAME}",
  "ERROR_CREATING_LAUNCH_SCRIPT": "حدث خطأ أثناء تثبيت اختصار سطر الأوامر. يُرجى تجربة <a href='https://github.com/adobe/brackets/wiki/Command-Line-Arguments#troubleshooting'>اقتراحات استكشاف الأخطاء وإصلاحها هذه</a>.<br/><br/>السبب: {0}",
  "ERROR_CLTOOLS_RMFAILED": "تعذر إزالة الرابط الرمزي <code>/usr/local/bin/brackets</code> الموجود.",
  "ERROR_CLTOOLS_MKDIRFAILED": "تعذر إنشاء دليل <code>/usr/local/bin</code>.",
  "ERROR_CLTOOLS_LNFAILED": "تعذر إنشاء رابط رمزي <code>/usr/local/bin/brackets</code>.",
  "ERROR_CLTOOLS_SERVFAILED": "خطأ داخلي.",
  "ERROR_CLTOOLS_NOTSUPPORTED": "اختصار سطر الأوامر غير مدعوم على نظام التشغيل هذا.",
  "LAUNCH_SCRIPT_CREATE_SUCCESS": "نجاح! يمكنك الآن تشغيل {APP_NAME} بسهولة من سطر الأوامر: <code>brackets myFile.txt</code> لفتح ملف أو <code>brackets myFolder</code> لتبديل المشاريع. <br/><br/><a href='https://github.com/adobe/brackets/wiki/Command-Line-Arguments'>تعرّف على المزيد</a> حول استخدام {APP_NAME} من سطر الأوامر.",
  "ERROR_LOADING_EXTENSION": "خطأ في تحميل الامتداد",
  "ERROR_NO_EXTENSION_PACKAGE": "لم يتم الكشف عن ملف <code>package.json</code> في المشروع الحالي. هل المشروع الحالي امتداد {APP_NAME} صالح؟ </br>راجع <a href='https://github.com/phcode-dev/phoenix/wiki/How-To-Write-Extensions-And-Themes'>هذا الرابط</a> لمزيد من التفاصيل.",
  "ERROR_INVALID_EXTENSION_PACKAGE": "ملف <code>package.json</code> بتنسيق JSON غير صالح. </br>راجع <a href='https://github.com/phcode-dev/phoenix/wiki/How-To-Write-Extensions-And-Themes'>هذا الرابط</a> لمزيد من التفاصيل.",
  "ERROR_INVALID_EXTENSION_PACKAGE_FIELDS": "حقول مطلوبة مفقودة في <code>package.json</code>: [{0}] </br>راجع <a href='https://github.com/phcode-dev/phoenix/wiki/How-To-Write-Extensions-And-Themes'>هذا الرابط</a> لمزيد من التفاصيل.",
  "ERROR_NODE_JS_CRASH_TITLE": "عفوًا! حدث خطأ ما.",
  "ERROR_NODE_JS_CRASH_MESSAGE": "لقد واجهنا مشكلة ونحتاج إلى إعادة تشغيل {APP_NAME}. لا تقلق، فنحن نحاول حفظ جميع أعمالك قبل إعادة التشغيل. </br>(الخطأ: ERROR_NODE_JS_CRASH)",
  "LANGUAGE_TITLE": "تغيير اللغة",
  "LANGUAGE_MESSAGE": "اللغة:",
  "LANGUAGE_SUBMIT": "إعادة تحميل {APP_NAME}",
  "LANGUAGE_CANCEL": "إلغاء",
  "LANGUAGE_SYSTEM_DEFAULT": "افتراضي النظام",
  "HEALTH_DATA_NOTIFICATION": "تفضيلات تقرير الحالة",
  "HEALTH_FIRST_POPUP_TITLE": "إشعار الخصوصية",
  "HEALTH_DATA_DO_TRACK": "مشاركة معلومات مجهولة المصدر حول كيفية استخدامي لـ {APP_NAME}",
  "HEALTH_DATA_NOTIFICATION_MESSAGE": "لا يقوم تطبيق {APP_NAME} <strong>بجمع أو معالجة أي معلومات تعريف شخصية</strong>، ولكنه <strong>يجمع إحصاءات استخدام مجهولة المصدر</strong> لحماية خصوصيتك.  البيانات المجهولة معفاة من متطلبات إخطار النظام الأوروبي العام لحماية البيانات/قانون خصوصية المستهلك في كاليفورنيا، لكننا نعتقد أن لديك الحق في اختيار عدم المشاركة في جمع البيانات المجهولة المصدر أيضًا.<br><br> يمكنك الاطلاع على بياناتك أو <strong>اختيار عدم مشاركة أي بيانات مجهولة المصدر</strong> عن طريق تحديد <strong>مساعدة > تقرير الحالة</strong>. تساعد إحصاءات استخدام التطبيق <strong>المجهولة المصدر</strong> وتقارير الأخطاء على تحديد أولويات الميزات، والعثور على الأخطاء، وتحديد مشكلات سهولة الاستخدام لتحسين تجربتك مع {APP_NAME}. بدون هذه البيانات، لن نعرف الميزات التي تستحق تطويرها من أجلك! <br>",
  "HEALTH_DATA_PREVIEW": "تقرير حالة {APP_NAME}",
  "HEALTH_DATA_PREVIEW_INTRO": "<p>{APP_NAME} <strong>لا تجمع أو تعالج أي معلومات تعريف شخصية</strong>، ولكنها <strong>تجمع إحصائيات استخدام مجهولة المصدر</strong> لحماية خصوصيتك. تساعد إحصائيات استخدام التطبيق وتقارير الأخطاء <strong>المجهولة المصدر</strong> هذه على تحديد أولويات الميزات، والعثور على الأخطاء، واكتشاف مشكلات سهولة الاستخدام لتحسين تجربتك مع {APP_NAME}.</p> <p>فيما يلي معاينة للبيانات التي سيتم إرسالها في تقرير الحالة التالي <em>إذا</em> كان مُمكّنًا. (راجع أيضًا وحدة تحكم المطور لسجلات الأخطاء التي تحمل علامة \"تم اكتشاف خطأ فادح\".)</p>",
  "HEALTH_DATA_PREVIEW_NECESSARY": "يتم دائمًا جمع تحديثات الأمان/التطبيق، وتهيئة مكتبة التحليلات، وعدد المستخدمين، ووقت الاستخدام بشكل مجهول كمؤشرات ضرورية لصحة التطبيق. هذه إحصائيات مجمعة ولا يتم إرسال/تسجيل أي بيانات شخصية.",
  "INLINE_TIMING_EDITOR_TIME": "الوقت",
  "INLINE_TIMING_EDITOR_PROGRESSION": "التقدم",
  "BEZIER_EDITOR_INFO": "<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> تحريك النقطة المحددة<br><kbd class='text'>Shift</kbd> تحريك بعشر وحدات<br><kbd class='text'>Tab</kbd> تبديل النقاط",
  "STEPS_EDITOR_INFO": "<kbd>↑</kbd><kbd>↓</kbd> زيادة أو نقصان الخطوات<br><kbd>←</kbd><kbd>→</kbd> 'بداية' أو 'نهاية'",
  "INLINE_TIMING_EDITOR_INVALID": "القيمة القديمة <code>{0}</code> غير صالحة، لذلك تم تغيير الدالة المعروضة إلى <code>{1}</code>. سيتم تحديث المستند مع أول تعديل.",
  "COLOR_EDITOR_CURRENT_COLOR_SWATCH_TIP": "اللون الحالي",
  "COLOR_EDITOR_ORIGINAL_COLOR_SWATCH_TIP": "اللون الأصلي",
  "COLOR_EDITOR_RGBA_BUTTON_TIP": "تنسيق RGBa",
  "COLOR_EDITOR_HEX_BUTTON_TIP": "تنسيق Hex",
  "COLOR_EDITOR_HSLA_BUTTON_TIP": "تنسيق HSLa",
  "COLOR_EDITOR_0X_BUTTON_TIP": "تنسيق Hex (0x)",
  "COLOR_EDITOR_USED_COLOR_TIP_SINGULAR": "{0} (مستخدم {1} مرة)",
  "COLOR_EDITOR_USED_COLOR_TIP_PLURAL": "{0} (مستخدم {1} مرة)",
  "EDIT": "تحرير",
  "CMD_JUMPTO_DEFINITION": "الانتقال إلى التعريف",
  "CMD_SHOW_PARAMETER_HINT": "إظهار تلميح المعامل",
  "NO_ARGUMENTS": "<no parameters>",
  "DETECTED_EXCLUSION_TITLE": "مشكلة في استنتاج ملف JavaScript",
  "DETECTED_EXCLUSION_INFO": "واجه {APP_NAME} مشكلة في معالجة <span class='dialog-filename'>{0}</span>.<br><br>لن تتم معالجة هذا الملف بعد الآن للحصول على تلميحات التعليمات البرمجية أو الانتقال إلى التعريف أو التحرير السريع. لإعادة تمكين هذا الملف، افتح <code>.phcode.json</code> في مشروعك وقم بتحرير <code>jscodehints.detectedExclusions</code>.<br><br>من المحتمل أن تكون هذه خلل في {APP_NAME}. إذا كان بإمكانك تقديم نسخة من هذا الملف، فيُرجى <a href='https://github.com/adobe/brackets/wiki/How-to-Report-an-Issue'>الإبلاغ عن خلل</a> مع رابط للملف المذكور هنا.",
  "CMD_REFACTOR": "إعادة هيكلة",
  "CMD_EXTRACTTO_VARIABLE": "استخراج إلى متغير",
  "CMD_EXTRACTTO_FUNCTION": "استخراج إلى دالة",
  "ERROR_TERN_FAILED": "تعذر الحصول على بيانات من Tern",
  "ERROR_EXTRACTTO_VARIABLE_NOT_VALID": "التحديد لا يُكَوِّن تعبيرًا",
  "ERROR_EXTRACTTO_FUNCTION_NOT_VALID": "يجب أن يُمَثِّلَ المقطع المحدد مجموعة من العبارات أو تعبيرًا",
  "ERROR_EXTRACTTO_VARIABLE_MULTICURSORS": "لا يعمل الاستخراج إلى متغير في حالة المؤشرات المتعددة",
  "ERROR_EXTRACTTO_FUNCTION_MULTICURSORS": "لا يعمل الاستخراج إلى دالة في حالة المؤشرات المتعددة",
  "EXTRACTTO_FUNCTION_SELECT_SCOPE": "اختر نطاق الوجهة",
  "EXTRACTTO_VARIABLE_SELECT_EXPRESSION": "حدد تعبيرًا",
  "CMD_REFACTORING_RENAME": "إعادة تسمية",
  "CMD_REFACTORING_TRY_CATCH": "تغليف بـ Try Catch",
  "CMD_REFACTORING_CONDITION": "تغليف بشرط",
  "CMD_REFACTORING_GETTERS_SETTERS": "إنشاء أدوات التحقق/التعيين (Getters/Setters)",
  "CMD_REFACTORING_ARROW_FUNCTION": "تحويل إلى دالة سهمية",
  "DESCRIPTION_CODE_REFACTORING": "تفعيل/تعطيل إعادة هيكلة شفرة جافاسكربت",
  "ERROR_TRY_CATCH": "حدد شيفرة صالحة لتضمينها في كتلة Try-catch",
  "ERROR_WRAP_IN_CONDITION": "حدد شيفرة صالحة لتضمينها في كتلة شرطية",
  "ERROR_ARROW_FUNCTION": "ضع المؤشر داخل تعبير دالة",
  "ERROR_GETTERS_SETTERS": "ضع المؤشر على عضو من تعبير كائن",
  "ERROR_RENAME_MULTICURSOR": "لا يمكن إعادة التسمية عند استخدام مؤشرات متعددة",
  "ERROR_RENAME_QUICKEDIT": "لا يمكن إعادة تسمية هذا المُعرّف، حيث تتم الإشارة إليه في مكان آخر خارج هذه الدالة",
  "ERROR_RENAME_GENERAL": "لا يمكن إعادة تسمية النص المحدد",
  "JSHINT_NAME": "جيه إس هينت (JSHint)",
  "JSHINT_CONFIG_ERROR": "خطأ في قراءة ملف تهيئة JSHint: {0}",
  "JSHINT_CONFIG_JSON_ERROR": "خطأ: ملف تهيئة JSHint `{0}` ليس بصيغة JSON صالحة",
  "ESLINT_NAME": "إي إس لينت (ESLint)",
  "CSS_LINT_NAME": "{0}",
  "HTML_LINT_NAME": "إتش تي إم إل (HTML)",
  "HTML_LINT_CONFIG_JSON_ERROR": "خطأ: ملف تهيئة مدقق HTML `{0}` ليس بصيغة JSON صالحة",
  "HTML_LINT_CONFIG_UNSUPPORTED": "خطأ: صيغة التهيئة `{0}` غير مدعومة. استخدم تهيئة JSON `.htmlvalidate.json`",
  "CMD_ENABLE_QUICK_VIEW": "عرض سريع عند المرور",
  "CMD_ENABLE_SELECTION_VIEW": "عرض التحديد",
  "TOOLTIP_CLICK_TO_EDIT_COLOR": "انقر هنا لتعديل اللون",
  "CMD_RECENT_PROJECTS": "المشاريع الأخيرة",
  "REMOVE_FROM_RECENT_PROJECTS": "إزالة من المشاريع الأخيرة",
  "DOCS_MORE_LINK": "اقرأ المزيد",
  "DOCS_MORE_LINK_MDN_TITLE": "انقر لقراءة التوثيق",
  "COLLAPSE_ALL": "طي الكل",
  "EXPAND_ALL": "توسيع الكل",
  "COLLAPSE_CURRENT": "طي الحالي",
  "EXPAND_CURRENT": "توسيع الحالي",
  "RECENT_FILES_DLG_HEADER": "الملفات الأخيرة",
  "RECENT_FILES_DLG_CLEAR_BUTTON_LABEL": "مسح",
  "RECENT_FILES_DLG_CLEAR_BUTTON_TITLE": "مسح الملفات غير الموجودة في مجموعة العمل",
  "RECOVER_UNSAVED_FILES_TITLE": "استعادة الملفات غير المحفوظة؟",
  "RECOVER_UNSAVED_FILES_MESSAGE": "هل تريد استعادة الملفات غير المحفوظة من جلستك السابقة؟",
  "RECOVER_UNSAVED_FILES_RESTORE": "استعادة",
  "DISCARD_UNSAVED_FILES_RESTORE": "تجاهل",
  "DESCRIPTION_CLOSE_BRACKETS": "`true` للإغلاق التلقائي للأقواس والمعقوفات والأقواس الصغيرة",
  "DESCRIPTION_CLOSE_OTHERS_ABOVE": "`false` لإزالة \"إغلاق الأخرى أعلاه\" من قائمة سياق ملفات العمل",
  "DESCRIPTION_CLOSE_OTHERS_BELOW": "`false` لإزالة \"إغلاق الأخرى أدناه\" من قائمة سياق ملفات العمل",
  "DESCRIPTION_CLOSE_OTHERS": "`false` لإزالة \"إغلاق الأخرى\" من قائمة سياق ملفات العمل",
  "DESCRIPTION_CLOSE_TAGS": "يُعيّن خيارات إغلاق الوسوم",
  "DESCRIPTION_CLOSE_TAGS_DONT_CLOSE_TAGS": "مصفوفة من الوسوم التي لا يجب إغلاقها تلقائيًا",
  "DESCRIPTION_CLOSE_TAGS_WHEN_OPENING": "إغلاق عند كتابة > لعلامة الفتح",
  "DESCRIPTION_CLOSE_TAGS_WHEN_CLOSING": "إغلاق عند كتابة / لعلامة الإغلاق",
  "DESCRIPTION_CLOSE_TAGS_INDENT_TAGS": "مصفوفة من الوسوم التي عند فتحها يتم إضافة سطر فارغ",
  "DESCRIPTION_CODE_FOLDING_ALWAY_USE_INDENT_FOLD": "`true` لإنشاء علامات أقسام قابلة للطي دائمًا عند تغير مستوى المسافة البادئة",
  "DESCRIPTION_CODE_FOLDING_ENABLED": "`true` لتمكين طي الشفرة",
  "DESCRIPTION_CODE_FOLDING_HIDE_UNTIL_MOUSEOVER": "`true` لجعل علامات طي الأقسام مرئية فقط عند تحريك الماوس فوق الحافة",
  "DESCRIPTION_CODE_FOLDING_MAX_FOLD_LEVEL": "يُحدد عدد المستويات التي يُطبّق عليها \"طي الكل\"",
  "DESCRIPTION_CODE_FOLDING_MIN_FOLD_SIZE": "الحد الأدنى لعدد الأسطر قبل ظهور رمز قسم قابل للطي",
  "DESCRIPTION_CODE_FOLDING_SAVE_FOLD_STATES": "صحيح لتذكر الأقسام المنهارة إذا أغلقت وأعدت فتح ملف أو مشروع",
  "DESCRIPTION_CODE_FOLDING_MAKE_SELECTIONS_FOLDABLE": "صحيح لتمكين طي الشفرة على النص المحدد في المحرر",
  "DESCRIPTION_DISABLED_DEFAULT_EXTENSIONS": "الإضافات الافتراضية المعطلة",
  "DESCRIPTION_ATTR_HINTS": "تفعيل/تعطيل تلميحات سمات HTML",
  "DESCRIPTION_CSS_PROP_HINTS": "تفعيل/تعطيل تلميحات خصائص CSS/LESS/SCSS",
  "DESCRIPTION_JS_HINTS": "تفعيل/تعطيل تلميحات شيفرة JavaScript",
  "DESCRIPTION_JS_HINTS_TYPE_DETAILS": "تفعيل/تعطيل تفاصيل نوع البيانات في تلميحات شيفرة JavaScript",
  "DESCRIPTION_PREF_HINTS": "تفعيل/تعطيل تلميحات شيفرة التفضيلات",
  "DESCRIPTION_SPECIAL_CHAR_HINTS": "تفعيل/تعطيل تلميحات كيانات HTML",
  "DESCRIPTION_SVG_HINTS": "تفعيل/تعطيل تلميحات شيفرة SVG",
  "DESCRIPTION_HTML_TAG_HINTS": "تفعيل/تعطيل تلميحات وسم HTML",
  "DESCRIPTION_URL_CODE_HINTS": "تفعيل/تعطيل تلميحات عناوين URL في HTML و CSS/LESS/SCSS",
  "DESCRIPTION_DRAG_DROP_TEXT": "تفعيل/تعطيل وظيفة السحب والإفلات",
  "DESCRIPTION_HEALTH_DATA_TRACKING": "تفعيل تتبع بيانات الصحة",
  "DESCRIPTION_HIGHLIGHT_MATCHES": "تفعيل التمييز التلقائي للسلاسل المطابقة في جميع أنحاء المستند",
  "DESCRIPTION_HIGHLIGHT_MATCHES_SHOW_TOKEN": "تمييز جميع السلاسل التي تطابق الرمز الموجود فيه المؤشر حاليًا (لا حاجة للتحديد)",
  "DESCRIPTION_HIGHLIGHT_MATCHES_WORDS_ONLY": "تمييز فقط عندما يكون التحديد رمزًا كاملاً",
  "DESCRIPTION_INSERT_HINT_ON_TAB": "`true` لإدراج تلميح الشيفرة المحدد حاليًا عند الضغط على Tab",
  "DESCRIPTION_NO_HINTS_ON_DOT": "`true` لعدم إظهار تلميحات شيفرة JS تلقائيًا عند كتابة .",
  "DESCRIPTION_JSHINT_DISABLE": "`true` لتعطيل مُدقق JSHints في لوحة المشاكل",
  "DESCRIPTION_ESLINT_DISABLE": "صحيح لتعطيل مُدقق ESLint في لوحة المشاكل",
  "DESCRIPTION_HTML_LINT_DISABLE": "صحيح لتعطيل مُدقق HTML في لوحة المشاكل",
  "DESCRIPTION_ESLINT_FAILED": "فشل ESLint ({0}). تأكد من أن المشروع يحتوي على <a href='https://eslint.org/docs/latest/use/configure/configuration-files'>ملفات تهيئة</a> صالحة",
  "DESCRIPTION_ESLINT_USE_NATIVE_APP": "ESLint متاح فقط في تطبيق سطح المكتب. قم بتنزيله من <a href='https://phcode.io'>phcode.io</a>",
  "DESCRIPTION_ESLINT_LOAD_FAILED": "فشل تحميل ESLint لهذا المشروع. {APP_NAME} يدعم فقط إصدارات ESLint الأعلى من 7.",
  "DESCRIPTION_ESLINT_DO_NPM_INSTALL": "يُرجى تشغيل `npm install` على مشروعك لتمكين ESLint",
  "DESCRIPTION_LANGUAGE": "إعدادات خاصة باللغة",
  "DESCRIPTION_LANGUAGE_FILE_EXTENSIONS": "تعيينات إضافية من امتداد الملف إلى اسم اللغة",
  "DESCRIPTION_LANGUAGE_FILE_NAMES": "تعيينات إضافية من اسم الملف إلى اسم اللغة",
  "DESCRIPTION_LINEWISE_COPY_CUT": "سيؤدي النسخ والقص عندما لا يكون هناك تحديد إلى نسخ أو قص الأسطر الكاملة التي تحتوي على مؤشرات فيها",
  "DESCRIPTION_INPUT_STYLE": "تحديد كيفية تعامل CodeMirror مع الإدخال والتركيز. يمكن أن يكون textarea، وهو الافتراضي، أو contenteditable وهو الأفضل لقارئات الشاشة (غير مستقر)",
  "DESCRIPTION_LINTING_ENABLED": "صحيح لتمكين فحص الشيفرة",
  "DESCRIPTION_ASYNC_TIMEOUT": "الوقت بالميلي ثانية الذي تنتهي بعده صلاحية المدققات اللغوية غير المتزامنة",
  "DESCRIPTION_LINTING_PREFER": "مصفوفة من المدققات اللغوية ليتم تشغيلها أولاً",
  "DESCRIPTION_LIVE_DEV_MULTIBROWSER": "صحيح لتمكين المعاينة المباشرة التجريبية",
  "DESCRIPTION_USE_PREFERED_ONLY": "صحيح لتشغيل الموفرين المحددين في linting.prefer فقط",
  "DESCRIPTION_MAX_CODE_HINTS": "الحد الأقصى لتلميحات الشيفرة المعروضة في وقت واحد",
  "DESCRIPTION_PATH": "إعدادات خاصة بالمسار",
  "DESCRIPTION_PROXY": "عنوان URL لخادم الوكيل المستخدم لتثبيت الامتداد",
  "DESCRIPTION_SCROLL_PAST_END": "صحيح لتمكين التمرير إلى ما بعد نهاية المستند",
  "DESCRIPTION_SHOW_CODE_HINTS": "`false` لإخفاء كل تلميحات الأكواد",
  "DESCRIPTION_SHOW_CURSOR_WHEN_SELECTING": "إبقاء المؤشر الوامض مرئيًا عند تحديد نص",
  "DESCRIPTION_SHOW_LINE_NUMBERS": "`true` لإظهار أرقام الأسطر في \"هامش\" على يسار الكود",
  "DESCRIPTION_RULERS_COLUMNS": "مصفوفة من أرقام الأعمدة لرسم مساطر عمودية في المحرر. مثال: `[80, 100]`",
  "DESCRIPTION_RULERS_COLORS": "مصفوفة من ألوان المساطر المقابلة لخيار `rulers` في المحرر. مثال: `[\"#3d3d3d\", \"red\"]`",
  "DESCRIPTION_RULERS_ENABLED": "`true` لتمكين مساطر المحرر، وإلا `false`",
  "DESCRIPTION_AUTO_RENAME_TAGS": "`true` لإعادة تسمية علامة HTML/XML المزدوجة تلقائيًا، وإلا `false`",
  "DESCRIPTION_DRAG_AND_DROP_ENABLED": "`true` لتمكين وظيفة السحب والإفلات للملفات والمجلدات من مستكشف الملفات أو Finder",
  "DESCRIPTION_TRIPLE_CTRL_PALETTE": "`true` لتمكين إظهار لوحة الأوامر المرئية عند الضغط على مفتاح Ctrl/Cmd ثلاث مرات متتالية",
  "DESCRIPTION_SMART_INDENT": "المسافة البادئة تلقائيًا عند إنشاء كتلة جديدة",
  "DESCRIPTION_SOFT_TABS": "`false` لإيقاف سلوك علامات التبويب المرنة",
  "DESCRIPTION_SORT_DIRECTORIES_FIRST": "`true` لترتيب المجلدات أولاً في شجرة المشروع",
  "DESCRIPTION_SPACE_UNITS": "عدد المسافات المستخدمة للمسافة البادئة القائمة على المسافات",
  "DESCRIPTION_STATIC_SERVER_PORT": "رقم المنفذ الذي يجب أن يستخدمه الخادم المدمج للمعاينة المباشرة",
  "DESCRIPTION_STYLE_ACTIVE_LINE": "`true` لتسليط الضوء على لون خلفية السطر الذي يوجد عليه المؤشر",
  "DESCRIPTION_TAB_SIZE": "عدد المسافات التي سيتم عرضها لعلامات التبويب",
  "DESCRIPTION_USE_TAB_CHAR": "`true` لاستخدام علامات التبويب بدلاً من المسافات",
  "DESCRIPTION_AUTO_TAB_SPACE": "`true` للكشف التلقائي عن علامات التبويب والمسافات المستخدمة في الملف الحالي",
  "DESCRIPTION_UPPERCASE_COLORS": "`true` لإنشاء ألوان سداسية عشرية بأحرف كبيرة في محرر الألوان المضمن",
  "DESCRIPTION_WORD_WRAP": "التفاف الأسطر التي تتجاوز عرض إطار العرض",
  "DESCRIPTION_SEARCH_AUTOHIDE": "إغلاق البحث بمجرد التركيز على المحرر",
  "DESCRIPTION_DETECTED_EXCLUSIONS": "قائمة بالملفات التي تم الكشف عنها والتي تتسبب في خروج Tern عن السيطرة",
  "DESCRIPTION_INFERENCE_TIMEOUT": "مقدار الوقت الذي سينتهي بعده Tern عند محاولة فهم الملفات",
  "DESCRIPTION_SHOW_ERRORS_IN_STATUS_BAR": "`true` لإظهار الأخطاء في شريط الحالة",
  "DESCRIPTION_QUICK_VIEW_ENABLED": "`true` لتمكين العرض السريع",
  "DESCRIPTION_SELECTION_VIEW_ENABLED": "`true` لتمكين عرض التحديد",
  "DESCRIPTION_EXTENSION_LESS_IMAGE_PREVIEW": "`true` لعرض معاينات الصور لعناوين URL التي تفتقد الامتدادات",
  "DESCRIPTION_NUMBER_QUICK_VIEW": "`true` لعرض العرض السريع عند المرور فوق الأرقام في المحرر",
  "DESCRIPTION_THEME": "اختر سمة {APP_NAME}",
  "DESCRIPTION_USE_THEME_SCROLLBARS": "`true` للسماح بأشرطة التمرير المخصصة",
  "DESCRIPTION_EDITOR_LINE_HEIGHT": "ضبط التباعد الرأسي بين أسطر التعليمات البرمجية في المحرر. اختر قيمة بين ١ و ٣، القيمة الافتراضية هي ١.٥",
  "DESCRIPTION_LINTING_COLLAPSED": "صحيح لإخفاء لوحة التدقيق اللغوي",
  "DESCRIPTION_FONT_FAMILY": "تغيير نوع الخط",
  "DESCRIPTION_DESKTOP_ZOOM_SCALE": "اختر عامل مقياس التكبير/التصغير من ٠.١ (لعرض أكثر إيجازًا) إلى ٢ (لعرض أكبر وأكثر تكبيرًا). متوفر في تطبيقات سطح المكتب فقط",
  "DESCRIPTION_FONT_SIZE": "تغيير حجم الخط؛ على سبيل المثال: 13 بكسل",
  "DESCRIPTION_FIND_IN_FILES_NODE": "صحيح لتمكين البحث القائم على العقد",
  "DESCRIPTION_FIND_IN_FILES_INSTANT": "صحيح لتمكين البحث الفوري",
  "DESCRIPTION_FONT_SMOOTHING": "خاص بنظام ماك فقط: \"subpixel-antialiased\" لتمكين التنعيم الفرعي للبكسل أو \"antialiased\" للتنعيم بمقياس الرمادي",
  "DESCRIPTION_OPEN_PREFS_IN_SPLIT_VIEW": "خطأ لتعطيل فتح ملف التفضيلات في طريقة العرض المقسمة",
  "DESCRIPTION_OPEN_USER_PREFS_IN_SECOND_PANE": "خطأ لفتح ملف تفضيلات المستخدم في الجزء الأيسر/العلوي",
  "DESCRIPTION_MERGE_PANES_WHEN_LAST_FILE_CLOSED": "دمج الأجزاء بعد إغلاق آخر ملف من الجزء عبر زر الإغلاق في رأس الجزء",
  "DESCRIPTION_SHOW_PANE_HEADER_BUTTONS": "تبديل وقت إظهار أزرار الإغلاق وعرض التقليب في الرأس.",
  "DEFAULT_PREFERENCES_JSON_HEADER_COMMENT": "/*",
  "DEFAULT_PREFERENCES_JSON_DEFAULT": "افتراضي",
  "DESCRIPTION_PURE_CODING_SURFACE": "تفعيل وضع الكود فقط وإخفاء جميع عناصر واجهة المستخدم الأخرى في {APP_NAME}",
  "DESCRIPTION_INDENT_LINE_COMMENT": "تفعيل مسافة بادئة لتعليقات الأسطر",
  "DESCRIPTION_RECENT_FILES_NAV": "تفعيل/تعطيل التنقل في الملفات الحديثة",
  "DESCRIPTION_LIVEDEV_WEBSOCKET_PORT": "المنفذ الذي يعمل عليه خادم WebSocket للمعاينة المباشرة",
  "DESCRIPTION_LIVEDEV_ENABLE_REVERSE_INSPECT": "تعطيل الفحص العكسي للمعاينة المباشرة",
  "DESCRIPTION_LIVEDEV_NO_PREVIEW": "لا يوجد شيء للمعاينة!",
  "DESCRIPTION_LIVEDEV_EXCLUDED": "الخادم المخصص لا يمكنه عرض هذا الملف",
  "DESCRIPTION_LIVEDEV_NO_PREVIEW_EXCLUDED": "إعدادات المعاينة المباشرة مُهيأة لعرض الملفات من المجلد '{0}' فقط",
  "DESCRIPTION_LIVEDEV_NO_PREVIEW_DETAILS": "الرجاء تحديد ملف HTML للمعاينة",
  "DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED": "المعاينة غير متاحة!",
  "DESCRIPTION_LIVEDEV_PREVIEW_RESTRICTED_DETAILS": "ملف HTML هذا ليس جزءًا من المشروع الحالي. لأسباب أمنية، لا يمكن معاينة سوى ملفات المشروع بشكل مباشر. لمعاينة هذا الملف، افتح المجلد الذي يحتويه كمشروع منفصل.",
  "DESCRIPTION_LIVEDEV_MAIN_HEADING": "أوه أوه! <br>متصفحك الحالي لا يدعم المعاينة المباشرة.",
  "DESCRIPTION_LIVEDEV_MAIN_SPAN": "احصل على أفضل تجربة معاينة مباشرة عن طريق تنزيل تطبيقاتنا الأصلية لأنظمة Windows و Mac و Linux من <a href=\"https://phcode.io\" style=\"color: white\">phcode.io</a>.<br>",
  "DESCRIPTION_LIVEDEV_SECURITY_POPOUT_MESSAGE": "أنت على وشك فتح ملف للمعاينة المباشرة. يُرجى المتابعة فقط إذا كنت تثق بمصدر هذا المشروع. انقر فوق \"وثوق بالمشروع\" للمتابعة، أو أغلق هذه النافذة إذا كنت لا تثق بالمصدر.",
  "DESCRIPTION_LIVEDEV_SECURITY_TRUST_MESSAGE": "أنت على وشك فتح ملف للمعاينة المباشرة. يُرجى المتابعة بالنقر فوق \"وثوق بالمشروع\" فقط إذا كنت تثق بمصدر هذا المشروع!",
  "CONFIRM_EXTERNAL_BROWSER_TITLE": "النوافذ المنبثقة محظورة",
  "CONFIRM_EXTERNAL_BROWSER_MESSAGE": "هل تريد السماح لصفحة المعاينة المباشرة بفتح عنوان URL هذا: {0}؟",
  "TRUST_PROJECT": "ثقة وتنفيذ المعاينة - {0}",
  "TRUST_AUTHORS": "هل تثق بمؤلفي هذا المشروع؟",
  "DOWNLOAD_FAILED": "فشل التنزيل.",
  "DOWNLOAD_COMPLETE": "تم التنزيل بنجاح!",
  "UPDATE_SUCCESSFUL": "تم التحديث بنجاح!",
  "UPDATE_FAILED": "فشل التحديث!",
  "VALIDATION_FAILED": "فشل التحقق من الصحة!",
  "INITIALISATION_FAILED": "فشل التهيئة!",
  "CLEANUP_FAILED": "فشل التنظيف!",
  "WARNING_TYPE": "تحذير!",
  "CLICK_RESTART_TO_UPDATE": "انقر فوق إعادة التشغيل لتحديث Brackets.",
  "UPDATE_ON_NEXT_LAUNCH": "سيتم تطبيق التحديث عند إعادة التشغيل.",
  "GO_TO_SITE": "انتقل إلى <a href = \"http://brackets.io/\"> brackets.io </a> لإعادة المحاولة.",
  "INTERNET_UNAVAILABLE": "لا يوجد اتصال بالإنترنت.",
  "UPDATEDIR_READ_FAILED": "تعذر قراءة دليل التحديث.",
  "UPDATEDIR_CLEAN_FAILED": "تعذر تنظيف دليل التحديث.",
  "INITIAL_DOWNLOAD": "جارٍ تنزيل التحديث...",
  "RETRY_DOWNLOAD": "فشل التنزيل. إعادة المحاولة...المحاولة",
  "VALIDATING_INSTALLER": "تم التنزيل! التحقق من صحة المُثبِّت...",
  "CHECKSUM_DID_NOT_MATCH": "لم تتطابق المجموعات الاختبارية.",
  "INSTALLER_NOT_FOUND": "لم يتم العثور على المُثبِّت.",
  "DOWNLOAD_ERROR": "حدث خطأ أثناء التنزيل.",
  "NETWORK_SLOW_OR_DISCONNECTED": "الشبكة غير متصلة أو بطيئة جدًا.",
  "RESTART_BUTTON": "إعادة التشغيل",
  "RESTART_APP_BUTTON": "إعادة تشغيل {APP_NAME}",
  "LATER_BUTTON": "لاحقًا",
  "DESCRIPTION_AUTO_UPDATE": "تفعيل/تعطيل التحديث التلقائي لـ {APP_NAME}",
  "AUTOUPDATE_ERROR": "خطأ!",
  "AUTOUPDATE_IN_PROGRESS": "التحديث قيد التنفيذ بالفعل.",
  "REMOVING": "جارٍ الإزالة...",
  "NUMBER_WITH_PERCENTAGE": "{0}%",
  "CMD_FIND_RELATED_FILES": "بحث عن الملفات ذات الصلة",
  "PHP_VERSION_INVALID": "حدث خطأ أثناء تحليل إصدار PHP. يُرجى التحقق من مُخرجات أمر \"php –version\".",
  "PHP_UNSUPPORTED_VERSION": "ثبّت بيئة تشغيل PHP7 لتمكين أدوات PHP، مثل تلميحات التعليمات البرمجية، وتلميحات المعلمات، والانتقال إلى التعريف، والمزيد. الإصدار الموجود: {0}",
  "PHP_EXECUTABLE_NOT_FOUND": "لم يتم العثور على بيئة تشغيل PHP. ثبّت بيئة تشغيل PHP7 وقم بتحديث \"executablePath\" في تفضيلات PHP بشكل مناسب. سيؤدي ذلك إلى تمكين أدوات PHP، مثل تلميحات التعليمات البرمجية، وتلميحات المعلمات، والانتقال إلى التعريف، والمزيد.",
  "PHP_PROCESS_SPAWN_ERROR": "تم مواجهة رمز الخطأ {0} أثناء بدء عملية PHP.",
  "PHP_SERVER_ERROR_TITLE": "خطأ",
  "PHP_SERVER_MEMORY_LIMIT_INVALID": "حد الذاكرة الذي قدمته غير صالح. راجع تفضيلات PHP لتعيين القيمة الصحيحة.",
  "DESCRIPTION_PHP_TOOLING_CONFIGURATION": "إعدادات التكوين الافتراضية لأدوات PHP",
  "OPEN_PREFERENNCES": "فتح التفضيلات",
  "LANGUAGE_TOOLS_PREFERENCES": "تفضيلات أدوات اللغة",
  "FIND_ALL_REFERENCES": "بحث عن كل المراجع",
  "REFERENCES_IN_FILES": "مراجع",
  "REFERENCE_IN_FILES": "مرجع",
  "REFERENCES_NO_RESULTS": "لا توجد مراجع متاحة لموقع المؤشر الحالي",
  "CMD_FIND_DOCUMENT_SYMBOLS": "بحث عن رموز المستند",
  "CMD_FIND_PROJECT_SYMBOLS": "بحث عن رموز المشروع",
  "REMOTE_DEBUGGING_ENABLED": "تم تفعيل تصحيح الأخطاء عن بُعد على localhost:",
  "REMOTE_DEBUGGING_PORT_INVALID": "لا يمكن تفعيل تصحيح الأخطاء عن بُعد على المنفذ {0}. يجب أن تكون أرقام المنافذ بين {1} و {2}.",
  "DESCRIPTION_EXTERNAL_APPLICATION_ASSOCIATE": "تعيينات امتداد الملف للتطبيقات الخارجية. الصيغة: \"<file_type>\": \"<default|applicationName|ApplicationPath>\", استخدم \"default\" لفتح الملفات في تطبيق النظام الافتراضي لنوع الملف.",
  "ASSOCIATE_GRAPHICS_FILE_TO_DEFAULT_APP_TITLE": "فتح ملفات الرسومات في برامج تحرير خارجية",
  "ASSOCIATE_GRAPHICS_FILE_TO_DEFAULT_APP_MSG": "يحتوي مجلدك الحالي على أنواع ملفات رسومات غير مدعومة من قبل {APP_NAME}.<br/>يمكنك الآن ربط أنواع ملفات محددة ببرامج تحرير خارجية. بمجرد ربطها، يمكنك فتح ملفات الرسومات مثل .xd و.psd و.jpg و.png و.ai و.svg في تطبيقاتها الافتراضية بالنقر المزدوج على الملفات في شجرة الملفات.<br/><br/>يرجى النقر على زر \"موافق\" لربط أنواع ملفات الرسومات بتطبيقاتها الافتراضية الخاصة.",
  "ASSOCIATE_GRAPHICS_FILE_TO_DEFAULT_APP_CNF_MSG": "تم ربط أنواع الملفات التالية بنجاح بالتطبيقات الافتراضية.<br/>{0} لديك خيار تغيير تفضيلاتك بشأن ما إذا كنت تريد حذف/إضافة ربط أنواع ملفات جديدة في ملف phcode.json من خلال الانتقال إلى قائمة \"Debug->Open Preferences File\" (التصحيح->فتح ملف التفضيلات).",
  "UNSUPPORTED_BROWSER_TITLE": "المتصفح غير مدعوم",
  "UNSUPPORTED_BROWSER_MESSAGE": "يرجى استخدام متصفح حديث (تم إصداره خلال السنوات الثلاث الماضية).",
  "UNSUPPORTED_BROWSER_MOBILE_TITLE": "متصفحات الجوال غير مدعومة",
  "UNSUPPORTED_BROWSER_MOBILE": "متصفحات الجوال والأجهزة اللوحية غير مدعومة بشكل كامل حاليًا. يمكنك إغلاق مربع الحوار هذا، لكن بعض الميزات في Phoenix لن تعمل في هذا المتصفح. <br/><br/>نحن نعمل على تطوير تطبيقات أصلية لأنظمة iOS و Android. <a href=\"https://github.com/phcode-dev/phoenix/discussions/1046\" target=\"_blank\">انضم إلى المناقشة هنا!</a>",
  "UNSUPPORTED_BROWSER_OPEN_FOLDER_TITLE": "الوصول إلى المجلد المحلي غير مدعوم من قبل المتصفح",
  "UNSUPPORTED_BROWSER_OPEN_FOLDER": "عذرًا، يبدو أن متصفحك الحالي لا يدعم فتح المجلدات المحلية. لهذه الميزة، نوصي باستخدام Chrome أو Edge أو Opera. <br/><br/>بدلاً من ذلك، نحن نعمل على تطوير تطبيقات أصلية لأنظمة Windows و Mac و Linux و iOS و Android لتوفير دعم كامل. <a href=\"https://github.com/phcode-dev/phoenix/discussions/1047\" target=\"_blank\">ابق على اطلاع على التحديثات!</a>",
  "ATTENTION_SAFARI_USERS": "تنبيه لمستخدمي Safari",
  "ATTENTION_SAFARI_USERS_MESSAGE": "<span>يحذف سفاري بيانات الموقع تلقائيًا إذا لم تتم إعادة زيارة الموقع في غضون ٧ أيام. يعتمد {APP_NAME} على تخزين المتصفح لحفظ مشاريعك، والتي قد تتم إزالتها بسبب هذه السياسة. <br/> <br/>يوصى<strong> بتنزيل تطبيق macOS لسطح المكتب</strong> من <a href='https://phcode.io' target='_blank' style='color: white'>https://phcode.io</a></span>",
  "CANNOT_PUBLISH_LARGE_PROJECT": "لا يمكن نشر مشروع كبير",
  "CANNOT_PUBLISH_LARGE_PROJECT_MESSAGE": "لا يزال Phoenix في مرحلة ألفا التجريبية. لم نقم yet بتمكين مزامنة المشاريع التي تحتوي على أكثر من ٥٠٠ ملف.",
  "SHARE_WEBSITE": "نشر ومشاركة الموقع؟",
  "PUBLISH": "نشر",
  "PUBLISH_CONSENT_MESSAGE": "معاينة التغييرات بسرعة ومشاركة موقعك الإلكتروني مع الآخرين. يمكن لـ {APP_NAME} نشر هذا الموقع نيابةً عنك على {0}. ستكون الروابط المنشورة صالحة لمدة ٣ أيام. </br>هل ترغب في نشر موقعك ومشاركته؟",
  "PUBLISH_SYNC_IN_PROGRESS": "المزامنة قيد التقدم للمعاينة...",
  "PUBLISH_PAGE": "انقر لنشر هذا الموقع ومشاركته",
  "PUBLISH_VIEW_PAGE": "انقر لعرض الصفحة المنشورة",
  "MISSING_FIELDS": "حقول مفقودة",
  "PLEASE_FILL_ALL_REQUIRED": "الرجاء ملء جميع الحقول المطلوبة المظللة باللون الأحمر",
  "CODE_EDITOR": "محرر الأكواد",
  "BUILD_THE_WEB": "بناء الويب",
  "IMPORT_PROJECT": "استيراد مشروع",
  "GIT_PROJECT": "جلب من Git",
  "NEW_PROJECT_FROM_GIT": "مشروع جديد من Git",
  "GIT_REPO_URL": "رابط مستودع Git :",
  "GIT_CLONE_URL": "رابط استنساخ Git :",
  "START_PROJECT": "بدء المشروع…",
  "DOWNLOAD_DESKTOP_APP": "تنزيل تطبيق سطح المكتب",
  "GET_DESKTOP_APP": "الحصول على تطبيق سطح المكتب",
  "CREATE_PROJECT": "إنشاء مشروع",
  "SETTING_UP_PROJECT": "إعداد المشروع",
  "LOCATION": "الموقع :",
  "ERROR_ONLY_GITHUB": "تدعم نسخة المتصفح من {APP_NAME} روابط GitHub فقط. للعمل مع روابط Git أخرى، يُرجى استخدام تطبيق سطح المكتب.",
  "ERROR_GIT_URL_INVALID": "يُرجى إدخال رابط استنساخ Git صالح.",
  "ERROR_GIT_FOLDER_NOT_EMPTY": "لا يمكن استخدام المجلد المحدد لاستنساخ Git لأنه ليس فارغًا أو غير قابل للقراءة.",
  "ERROR_GIT_FOLDER_NOT_EXIST": "لا يمكن استخدام المجلد المحدد لاستنساخ Git لأنه غير موجود.",
  "ERROR_CLONING_TITLE": "فشل استنساخ Git",
  "DOWNLOADING": "جارٍ التنزيل...",
  "DOWNLOADING_FILE": "جارٍ تنزيل {0}...",
  "EXTRACTING_FILES_PROGRESS": "جارٍ استخراج {0} من {1} ملف.",
  "COMPRESS_FILES_PROGRESS": "جارٍ ضغط {0} من {1} ملف.",
  "DOWNLOAD_FAILED_MESSAGE": "تأكد من أن رابط التنزيل صالح. </br>ملاحظة: نظرًا لأن Phoenix في مرحلة ألفا، فإن المستودعات الخاصة وروابط GitHub التي يزيد حجمها عن ٢٥ ميغابايت غير مسموح بها.",
  "PLEASE_SELECT_A_FOLDER": "الرجاء تحديد مجلد...",
  "UNZIP_IN_PROGRESS": "جارٍ فك ضغط الملفات...",
  "UNZIP_FAILED": "خطأ: فشل فك الضغط.",
  "CONFIRM_REPLACE_TITLE": "تأكيد الاستبدال",
  "KEEP_BOTH": "الاحتفاظ بكليهما",
  "EXPLORE": "ألعاب HTML",
  "BLOG": "المدونة",
  "PHOENIX_DEFAULT_PROJECT": "مشروع افتراضي",
  "PROJECT_NAME": "اسم المشروع:",
  "NEW_HTML": "مشروع HTML جديد",
  "LICENSE": "الترخيص والائتمانات:",
  "PREVIEW": "معاينة",
  "BUILD_WEBSITE": "إنشاء موقع ويب",
  "VIEW_MORE": "عرض المزيد...",
  "NEW_PROJECT_NOTIFICATION": "انقر على هذا الرمز لفتح نافذة `بدء مشروع` مرة أخرى.</br> شاهد المشاريع الأخيرة، أو افتح مجلدًا أو ابدأ مشاريع من قوالب.</br> <img src=\"styles/images/new_project.png\">",
  "BEAUTIFY_CODE_NOTIFICATION": "انقر هنا أو اضغط على <b>`{0}`</b> لتحسين تنسيق الشفرة. </br> <img src=\"styles/images/beautify.gif\">",
  "DEFAULT_PROJECT_NOTIFICATION": "افتح <b>المشروع الافتراضي</b> في {APP_NAME} للبدء بسرعة (مثالي كمسودة).<br><br>أو افتح مجلدًا من جهاز الكمبيوتر الخاص بك باستخدام رمز <strong>فتح مجلد</strong> أدناه.<br><a href='#' style='float:right;'>موافق</a>",
  "DIRECTORY_REPLACE_MESSAGE": "المجلد المحدد <span class='dialog-filename'>{0}</span> ليس فارغًا. هل أنت متأكد أنك تريد استبدال محتويات المجلد بالمشروع؟",
  "DEFAULT_PROJECT_HTML_CLICK_HERE": "انقر هنا لتحديد موقع هذا &lt;span&gt; في ملف HTML",
  "BUILD_WEBSITE_SECTION": "إنشاء موقع ويب",
  "LEARN_SECTION": "تعلم بالأمثلة",
  "CREATE_EXTENSION_SECTION": "إنشاء إضافات ومظاهر {APP_NAME}",
  "CREATE_EXTENSION": "إنشاء إضافة",
  "CREATE_THEME": "إنشاء سمة",
  "WEBPAGE_HOME_PAGE": "الصفحة الرئيسية",
  "WEBPAGE_BLOG": "صفحة المدونة",
  "WEBPAGE_DASHBOARD": "لوحة تحكم HTML",
  "WEBPAGE_BOOTSTRAP_EXAMPLES": "أمثلة Bootstrap",
  "PROJECTS_AT_A_GLANCE": "مشاريعك في لمحة",
  "PROJECT_AT_GLANCE_DESCRIPTION": "شاهد الفيديو للبدء.",
  "PROJECT_FROM_BROWSER": "مخزنة في متصفحك",
  "PROJECT_FROM_BROWSER_TERSE": "تخزين المتصفح",
  "PROJECT_SHOW_ON_STARTUP": "عرض هذه النافذة عند بدء التشغيل",
  "GUIDED_LIVE_PREVIEW": "قم بإجراء بعض تغييرات الشفرة في ملف HTML لمشاهدة المعاينة المباشرة. </br> <a href='#' style='float:right;'>موافق</a>",
  "GUIDED_LIVE_PREVIEW_POPOUT": "انقر فوق هذا الزر لإظهار المعاينة المباشرة في علامة تبويب جديدة. </br> <a href='#' style='float:right;'>موافق</a>",
  "TEST_TRANSLATE": "استخدم هذا لاختبار الترجمات",
  "BEAUTIFY_ERROR": "تعذر تحسين الكود. تحقق من الصياغة.",
  "BEAUTIFY_ERROR_ORIGINAL_CHANGED": "تعذر التحسين. تغير نص المحرر بعد التحسين.",
  "BEAUTIFY_PROJECT_BUSY_MESSAGE": "تحسين الملف {0}",
  "BEAUTIFY_ERROR_SELECTION": "تعذر التنسيق.</br>تم تحديد كتلة تعليمات برمجية غير مكتملة أو بناء جملة غير صالح.",
  "BEAUTIFY_OPTIONS": "خيارات التحكم في كيفية عمل تنسيق الشيفرة",
  "BEAUTIFY_OPTION_PRINT_WIDTH": "تحديد طول السطر الذي سيُستخدم للالتفاف بواسطة مُنسّق الشيفرة",
  "BEAUTIFY_OPTION_SEMICOLON": "إضافة فاصلة منقوطة في نهاية كل عبارة",
  "BEAUTIFY_OPTION_SINGLE_QUOTE": "استخدام علامات اقتباس مفردة بدلاً من علامات الاقتباس المزدوجة",
  "BEAUTIFY_OPTION_QUOTE_PROPS": "تغيير وقت وضع علامات اقتباس على خصائص الكائنات",
  "BEAUTIFY_OPTION_BRACKET_SAME_LINE": "وضع علامة > الخاصة بعنصر HTML متعدد الأسطر (HTML, JSX, Vue, Angular) في نهاية السطر الأخير بدلاً من وضعها وحدها في السطر التالي (لا ينطبق على العناصر ذاتية الإغلاق)",
  "BEAUTIFY_OPTION_SINGLE_ATTRIBUTE_PER_LINE": "فرض سمة واحدة لكل سطر في HTML و Vue و JSX",
  "BEAUTIFY_OPTION_PROSE_WRAP": "التفاف النثر إذا تجاوز عرض الطباعة في ملفات markdown",
  "BEAUTIFY_OPTION_PRINT_TRAILING_COMMAS": "طباعة الفواصل اللاحقة حيثما أمكن في البنى النحوية متعددة الأسطر المفصولة بفواصل",
  "DESCRIPTION_INDENT_GUIDES_ENABLED": "صحيح لإظهار خطوط دليل المسافة البادئة، وإلا خطأ.",
  "DESCRIPTION_HIDE_FIRST": "صحيح لإظهار أول خط لدليل المسافة البادئة، وإلا خطأ.",
  "DESCRIPTION_CSS_COLOR_PREVIEW": "صحيح لعرض معاينات الألوان في الهامش، وإلا خطأ.",
  "DESCRIPTION_EMMET": "صحيح لتمكين Emmet، وإلا خطأ.",
  "DESCRIPTION_SHOW_WORKING_SET": "صحيح لإظهار مجموعة العمل، خطأ لإخفائها.",
  "DESCRIPTION_TABBAR": "ضبط إعدادات شريط علامات التبويب.",
  "DESCRIPTION_SHOW_TABBAR": "صحيح لإظهار شريط علامات التبويب، وإلا خطأ.",
  "DESCRIPTION_NUMBER_OF_TABS": "عدد علامات التبويب التي سيتم عرضها في شريط علامات التبويب.  اضبط على -1 لعرض جميع علامات التبويب",
  "TABBAR_SHOW_HIDDEN_TABS": "إظهار علامات التبويب المخفية",
  "ENABLE_GIT": "تفعيل Git",
  "ACTION": "إجراء",
  "STATUSBAR_SHOW_GIT": "لوحة Git",
  "ADD_ENDLINE_TO_THE_END_OF_FILE": "إضافة سطر جديد في نهاية الملف",
  "ADD_TO_GITIGNORE": "إضافة إلى .gitignore",
  "AMEND_COMMIT": "تعديل آخر عملية ارتكاب",
  "SKIP_COMMIT_CHECKS": "تخطي عمليات التحقق قبل الارتكاب (--no-verify)",
  "AMEND_COMMIT_FORBIDDEN": "لا يمكن تعديل الارتكاب عندما لا توجد عمليات ارتكاب غير مدفوعة",
  "_ANOTHER_BRANCH": "فرع آخر",
  "AUTHOR": "المؤلف",
  "AUTHORS_OF": "مؤلفو",
  "SYSTEM_CONFIGURATION": "تهيئة النظام",
  "BRACKETS_GIT_ERROR": "واجه Git خطأً...",
  "BRANCH_NAME": "اسم الفرع",
  "BUTTON_CANCEL": "إلغاء",
  "CHECKOUT_COMMIT": "سحب (Checkout)",
  "CHECKOUT_COMMIT_DETAIL": "<b>رسالة الالتزام:</b> {0} <br><b>تجزئة الالتزام:</b> {1}",
  "GIT_CLONE": "استنساخ (Clone)",
  "BUTTON_CLOSE": "إغلاق",
  "BUTTON_COMMIT": "التزام (Commit)",
  "BUTTON_DEFAULTS": "استعادة الإعدادات الافتراضية",
  "BUTTON_FIND_CONFLICTS": "بحث عن تعارضات…",
  "GIT_INIT": "تهيئة",
  "BUTTON_MERGE_ABORT": "إحباط الدمج",
  "BUTTON_OK": "موافق",
  "BUTTON_REBASE_ABORT": "إحباط إعادة التأسيس",
  "BUTTON_REBASE_CONTINUE": "متابعة إعادة التأسيس",
  "BUTTON_REBASE_SKIP": "تخطي",
  "MENU_RESET_HARD": "تجاهل التغييرات والالتزامات بعد هذا (إعادة تعيين صارمة)",
  "MENU_RESET_MIXED": "تجاهل الالتزامات بعد هذا ولكن احتفظ بالتغييرات غير مؤكدة (إعادة تعيين مختلطة)",
  "MENU_RESET_SOFT": "تجاهل الالتزامات بعد هذا ولكن احتفظ بالتغييرات مؤكدة (إعادة تعيين ناعمة)",
  "MENU_TAG_COMMIT": "وسم الالتزام",
  "RESET_HARD_TITLE": "تأكيد إعادة الضبط الصعبة",
  "RESET_MIXED_TITLE": "تأكيد إعادة الضبط المختلطة",
  "RESET_SOFT_TITLE": "تأكيد إعادة الضبط الناعمة",
  "RESET_DETAIL": "<b>سيتم تجاهل الالتزامات التالية:</b><br><b>رسالة الالتزام:</b> {0}<br><b>أمر Git:</b> {1}",
  "RESET_HARD_MESSAGE": "سيؤدي هذا الإجراء إلى تجاهل جميع التغييرات والالتزامات التي تلي الالتزام المحدد. <b>لا يمكن التراجع عن هذه العملية بسهولة.</b> هل أنت متأكد أنك تريد المتابعة؟<br><br>⚠️ تحذير: هذا الإجراء يعيد كتابة التاريخ ولا يجب استخدامه على الالتزامات التي تم دفعها إلى فرع مشترك.",
  "RESET_MIXED_MESSAGE": "سيؤدي هذا الإجراء إلى تجاهل جميع الالتزامات التي تلي الالتزام المحدد ولكن مع الاحتفاظ بجميع التغييرات غير المُجهزة. <b>لا يمكن التراجع عن هذه العملية بسهولة.</b> هل أنت متأكد أنك تريد المتابعة؟<br><br>⚠️ تحذير: هذا الإجراء يعيد كتابة التاريخ ولا يجب استخدامه على الالتزامات التي تم دفعها إلى فرع مشترك.",
  "RESET_SOFT_MESSAGE": "سيؤدي هذا الإجراء إلى تجاهل جميع الالتزامات التي تلي الالتزام المحدد ولكن مع الاحتفاظ بجميع التغييرات المُجهزة لالتزام جديد. <b>لا يمكن التراجع عن هذه العملية بسهولة.</b> هل أنت متأكد أنك تريد المتابعة؟<br><br>⚠️ تحذير: هذا الإجراء يعيد كتابة التاريخ ولا يجب استخدامه على الالتزامات التي تم دفعها إلى فرع مشترك.",
  "BUTTON_SAVE": "حفظ",
  "RESET": "إعادة ضبط",
  "CHANGE_USER_EMAIL_TITLE": "تغيير بريد Git الإلكتروني",
  "CHANGE_USER_EMAIL": "تغيير بريد Git الإلكتروني…",
  "CHANGE_USER_EMAIL_MENU": "تغيير بريد Git الإلكتروني ({0})…",
  "CHANGE_USER_NAME_TITLE": "تغيير اسم مستخدم Git",
  "CHANGE_USER_NAME": "تغيير اسم مستخدم Git…",
  "CHANGE_USER_NAME_MENU": "تغيير اسم مستخدم Git ({0})…",
  "REQUIRES_APP_RESTART_SETTING": "يتطلب تطبيق هذا الإعداد إعادة تشغيل التطبيق ليكتمل",
  "CLEAN_FILE_END": "تم تنظيف الملف",
  "CLEAN_FILE_START": "تنظيف الملف",
  "CLEANING_WHITESPACE_PROGRESS": "جارٍ تنظيف المسافات البيضاء من الملفات…",
  "CLEAR_WHITESPACE_ON_FILE_SAVE": "مسح المسافات البيضاء عند حفظ الملف",
  "CLONE_REPOSITORY": "استنساخ المستودع",
  "CODE_INSPECTION_PROBLEMS": "مشاكل فحص الكود",
  "CODE_INSPECTION_IN_PROGRESS": "فحص الكود قيد التقدم…",
  "CODE_INSPECTION_PROBLEMS_NONE": "لم يتم الكشف عن أي مشاكل",
  "CODE_INSPECTION_DONE_FILES": "تم الانتهاء من {0} من {1} ملفًا…",
  "PLEASE_WAIT": "يُرجى الانتظار…",
  "COMMIT": "ارتكاب",
  "COMMIT_ALL_SHORTCUT": "ارتكاب جميع الملفات…",
  "COMMIT_CURRENT_SHORTCUT": "ارتكاب الملف الحالي…",
  "COMMIT_MESSAGE_PLACEHOLDER": "أدخل رسالة الالتزام هنا…",
  "CREATE_NEW_BRANCH": "إنشاء فرع جديد…",
  "CREATE_NEW_BRANCH_TITLE": "إنشاء فرع جديد",
  "CREATE_NEW_GITFTP_SCOPE": "إنشاء نطاق Git-FTP جديد…",
  "CREATE_NEW_REMOTE": "إنشاء نطاق بعيد جديد…",
  "CURRENT_TRACKING_BRANCH": "فرع التتبع الحالي",
  "_CURRENT_TRACKING_BRANCH": "فرع التتبع الحالي",
  "DEFAULT_GIT_TIMEOUT": "مهلة عملية Git الافتراضية (بالثواني)",
  "DELETE_FILE_BTN": "حذف الملف…",
  "DELETE_LOCAL_BRANCH": "حذف الفرع المحلي",
  "DELETE_LOCAL_BRANCH_NAME": "هل تريد حقًا حذف الفرع المحلي \"{0}\"؟",
  "DELETE_REMOTE": "حذف جهاز التحكم عن بُعد",
  "DELETE_REMOTE_NAME": "هل تريد حقًا حذف جهاز التحكم عن بُعد \"{0}\"؟",
  "DELETE_SCOPE": "حذف نطاق Git-FTP",
  "DELETE_SCOPE_NAME": "هل تريد حقًا حذف نطاق Git-FTP \"{0}\"؟",
  "DIALOG_CHECKOUT": "عند استخراج التزام، سيدخل المستودع في حالة DETACHED HEAD. لا يمكنك إجراء أي التزامات إلا إذا أنشأت فرعًا بناءً على هذا.",
  "DIALOG_PULL_TITLE": "سحب من جهاز التحكم عن بُعد",
  "DIALOG_PUSH_TITLE": "دفع إلى جهاز التحكم عن بُعد",
  "SKIP_PRE_PUSH_CHECKS": "تخطي عمليات التحقق قبل الدفع (--no-verify)",
  "DIFF": "فرق",
  "DIFFTOOL": "مقارنة مع أداة المقارنة",
  "DIFF_FAILED_SEE_FILES": "فشل أمر Git diff في توفير نتائج المقارنة. هذه قائمة بالملفات المُحضّرة للإيداع:",
  "DIFF_TOO_LONG": "المقارنة طويلة جدًا للعرض",
  "ENABLE_GERRIT_PUSH_REF": "استخدام مرجع دفع متوافق مع Gerrit",
  "ENTER_NEW_USER_EMAIL": "أدخل البريد الإلكتروني",
  "ENTER_NEW_USER_NAME": "أدخل اسم المستخدم",
  "ENTER_PASSWORD": "أدخل كلمة المرور:",
  "ENTER_REMOTE_GIT_URL": "أدخل عنوان Git URL للمستودع الذي تريد استنساخه:",
  "ENTER_REMOTE_NAME": "أدخل اسم المصدر الجديد:",
  "ENTER_REMOTE_URL": "أدخل عنوان URL للمصدر الجديد:",
  "ENTER_USERNAME": "أدخل اسم المستخدم:",
  "ERROR_NOTHING_SELECTED": "لم يتم تحديد أي شيء!",
  "ERROR_SAVE_FIRST": "احفظ المستند أولاً!",
  "ERROR_TERMINAL_NOT_FOUND": "لم يتم العثور على طرفية لنظام التشغيل الخاص بك، يمكنك تحديد أمر طرفية مخصص في الإعدادات",
  "EXTENDED_COMMIT_MESSAGE": "موسّع",
  "GETTING_STAGED_DIFF_PROGRESS": "جارٍ الحصول على اختلافات الملفات المرحلية…",
  "GIT_COMMIT": "تنفيذ أمر Git commit…",
  "GIT_COMMIT_IN_PROGRESS": "جارِ تنفيذ أمر Git Commit",
  "GIT_DIFF": "Git diff &mdash;",
  "GIT_PULL_RESPONSE": "استجابة Git Pull",
  "GIT_PUSH_RESPONSE": "استجابة إرسال Git",
  "GIT_REMOTES": "أجهزة Git البعيدة",
  "GIT_SETTINGS": "إعدادات Git…",
  "GIT_SETTINGS_TITLE": "إعدادات Git",
  "GOTO_NEXT_GIT_CHANGE": "انتقل إلى تغيير Git التالي",
  "GOTO_PREVIOUS_GIT_CHANGE": "انتقل إلى تغيير Git السابق",
  "GUTTER_CLICK_DETAILS": "انقر لمزيد من التفاصيل",
  "HIDE_UNTRACKED": "إخفاء الملفات غير المتتبعة في اللوحة",
  "HISTORY": "السجل",
  "HISTORY_COMMIT_BY": "بواسطة",
  "LINES": "أسطر",
  "_LINES": "أسطر",
  "MARK_MODIFIED_FILES_IN_TREE": "وضع علامة على الملفات المعدّلة في شجرة الملفات",
  "MERGE_BRANCH": "دمج فرع",
  "MERGE_MESSAGE": "رسالة الدمج",
  "MERGE_RESULT": "نتيجة الدمج",
  "NORMALIZE_LINE_ENDINGS": "تسوية نهايات الأسطر (إلى \\n)",
  "NOTHING_TO_COMMIT": "لا يوجد شيء لإضافته، دليل العمل نظيف.",
  "OPERATION_IN_PROGRESS_TITLE": "عملية Git قيد التقدم…",
  "ORIGIN_BRANCH": "فرع الأصل",
  "ON_BRANCH": "'{0}' - فرع Git الحالي",
  "PANEL_COMMAND": "إظهار لوحة Git",
  "PASSWORD": "كلمة المرور",
  "PASSWORDS": "كلمات المرور",
  "PATH_TO_GIT_EXECUTABLE": "مسار Git القابل للتنفيذ",
  "PULL_AVOID_MERGING": "تجنب الدمج اليدوي",
  "PULL_DEFAULT": "الدمج الافتراضي",
  "PULL_FROM": "سحب من",
  "PULL_MERGE_NOCOMMIT": "دمج بدون إيداع",
  "PULL_REBASE": "استخدام إعادة التأسيس",
  "PULL_RESET": "استخدام إعادة تعيين بسيطة",
  "PULL_SHORTCUT": "سحب من المستودع البعيد…",
  "PULL_SHORTCUT_BEHIND": "سحب من المستودع البعيد (متأخر بـ {0})…",
  "PULL_BEHAVIOR": "سلوك السحب",
  "FETCH_SHORTCUT": "جلب من المستودع البعيد",
  "PUSH_DEFAULT": "دفع افتراضي",
  "PUSH_DELETE_BRANCH": "حذف فرع بعيد",
  "PUSH_SEND_TAGS": "إرسال الوسوم",
  "PUSH_FORCED": "دفع قسري",
  "PUSH_SHORTCUT": "دفع إلى المستودع البعيد…",
  "PUSH_SHORTCUT_AHEAD": "دفع إلى المستودع البعيد (متقدم بـ {0})…",
  "PUSH_TO": "دفع إلى",
  "PUSH_BEHAVIOR": "سلوك الدفع",
  "Q_UNDO_CHANGES": "إعادة تعيين التغييرات للملف <span class='dialog-filename'>{0}</span>؟",
  "REBASE_RESULT": "نتيجة إعادة التأسيس",
  "REFRESH_GIT": "تحديث Git",
  "REMOVE_BOM": "إزالة BOM من الملفات",
  "REMOVE_FROM_GITIGNORE": "إزالة من .gitignore",
  "RESET_LOCAL_REPO": "تجاهل كل التغييرات منذ آخر عملية ارتكاب…",
  "DISCARD_CHANGES": "تجاهل التغييرات",
  "RESET_LOCAL_REPO_CONFIRM": "هل تريد تجاهل جميع التغييرات التي أجريت منذ آخر عملية ارتكاب؟ لا يمكن التراجع عن هذا الإجراء.",
  "UNDO_LOCAL_COMMIT_CONFIRM": "هل أنت متأكد أنك تريد التراجع عن آخر عملية ارتكاب غير مدفوعة؟",
  "MORE_OPTIONS": "المزيد من الخيارات",
  "CREDENTIALS": "بيانات الاعتماد",
  "SAVE_CREDENTIALS_HELP": "لستَ بحاجة إلى ملء اسم المستخدم/كلمة المرور إذا تمت إدارة بيانات اعتمادك في مكان آخر. استخدم هذا فقط عندما يستمر انتهاء مهلة العملية.",
  "SAVE_CREDENTIALS_IN_URL": "حفظ بيانات الاعتماد إلى عنوان URL البعيد (كنص عادي)",
  "SET_THIS_BRANCH_AS_TRACKING": "تعيين هذا الفرع كفرع تتبع جديد",
  "STRIP_WHITESPACE_FROM_COMMITS": "إزالة المسافات الزائدة من عمليات الارتكاب",
  "TARGET_BRANCH": "الفرع الهدف",
  "TITLE_CHECKOUT": "سحب الارتكاب؟",
  "TOOLTIP_CLONE": "استنساخ مستودع موجود",
  "TOOLTIP_COMMIT": "ارتكاب الملفات المحددة",
  "TOOLTIP_FETCH": "جلب جميع المستودعات البعيدة وتحديث العدادات",
  "TOOLTIP_FIND_CONFLICTS": "بدء بحث عن تعارضات دمج/إعادة التأسيس في المشروع",
  "TOOLTIP_HIDE_FILE_HISTORY": "إخفاء تاريخ الملف",
  "TOOLTIP_HIDE_HISTORY": "إخفاء التاريخ",
  "TOOLTIP_INIT": "تهيئة مستودع",
  "TOOLTIP_MERGE_ABORT": "إحباط عملية الدمج وإعادة تعيين HEAD إلى آخر ارتكاب محلي",
  "TOOLTIP_PICK_REMOTE": "اختيار مستودع بعيد مفضل",
  "TOOLTIP_PULL": "سحب Git",
  "TOOLTIP_PUSH": "دفع Git",
  "TOOLTIP_REBASE_ABORT": "إيقاف عملية إعادة التأسيس وإعادة تعيين HEAD إلى الفرع الأصلي",
  "TOOLTIP_REBASE_CONTINUE": "إعادة تشغيل عملية إعادة التأسيس بعد حل تعارض الدمج",
  "TOOLTIP_REBASE_SKIP": "إعادة تشغيل عملية إعادة التأسيس عن طريق تخطي التصحيح الحالي",
  "TOOLTIP_REFRESH_PANEL": "تحديث اللوحة",
  "TOOLTIP_SHOW_FILE_HISTORY": "إظهار سجل الملف",
  "TOOLTIP_SHOW_HISTORY": "إظهار السجل",
  "GIT_SHOW_FILE_HISTORY": "سجل التزامات الملف",
  "GIT_SHOW_HISTORY": "سجل الالتزامات",
  "UNDO_CHANGES": "تجاهل التغييرات",
  "UNDO_CHANGES_BTN": "تجاهل التغييرات…",
  "UNDO_LAST_LOCAL_COMMIT": "التراجع عن آخر إيداع محلي (غير مدفوع)…",
  "UNDO_COMMIT": "تراجع الإيداع",
  "URL": "عنوان URL",
  "USERNAME": "اسم المستخدم",
  "USER_ABORTED": "ألغى المستخدم العملية!",
  "USE_GIT_GUTTER": "استخدام علامات Git في الهامش",
  "USE_NOFF": "إنشاء دمج إيداع حتى عندما يتم حل الدمج كتقديم سريع (--no-ff)",
  "USE_REBASE": "استخدام إعادة التأسيس (REBASE)",
  "USE_VERBOSE_DIFF": "إظهار مُخرجات تفصيلية في الفروقات",
  "USE_DIFFTOOL": "استخدام أداة الفروقات (difftool)",
  "VIEW_AUTHORS_FILE": "عرض مؤلفي الملف…",
  "VIEW_AUTHORS_SELECTION": "عرض مؤلفي التحدّيد…",
  "VIEW_THIS_FILE": "عرض هذا الملف",
  "TAG_NAME_PLACEHOLDER": "أدخِل اسم الوسم هنا…",
  "TAG_NAME": "وسم",
  "CMD_CLOSE_UNMODIFIED": "إغلاق الملفات غير المُعدّلة",
  "FILE_ADDED": "ملف جديد",
  "FILE_COPIED": "تم النسخ",
  "FILE_DELETED": "تم الحذف",
  "FILE_IGNORED": "تم التجاهل",
  "FILE_MODIFIED": "تم التعديل",
  "FILE_RENAMED": "تمت إعادة تسميته",
  "FILE_STAGED": "مُجهّز",
  "FILE_UNMERGED": "غير مدمج",
  "FILE_UNMODIFIED": "غير معدل",
  "FILE_UNTRACKED": "غير مُتتبع",
  "GIT_PUSH_SUCCESS_MSG": "تم الدفع بتقديم سريع بنجاح",
  "GIT_PUSH_FORCE_UPDATED_MSG": "تم التحديث الإجباري بنجاح",
  "GIT_PUSH_DELETED_MSG": "تم حذف المرجع بنجاح",
  "GIT_PUSH_NEW_REF_MSG": "تم دفع مرجع جديد بنجاح",
  "GIT_PUSH_REJECTED_MSG": "تم رفض المرجع أو فشل الدفع",
  "GIT_PUSH_UP_TO_DATE_MSG": "المرجع مُحدّث ولا يحتاج إلى دفع.",
  "GIT_PULL_SUCCESS": "تم سحب Git بنجاح.",
  "GIT_MERGE_SUCCESS": "تم دمج Git بنجاح.",
  "GIT_REBASE_SUCCESS": "تم إعادة تعريف قاعدة Git بنجاح.",
  "GIT_BRANCH_DELETE_SUCCESS": "تم حذف فرع Git بنجاح.",
  "INIT_NEW_REPO_FAILED": "فشل تهيئة مستودع جديد.",
  "GIT_CLONE_REMOTE_FAILED": "فشل استنساخ المستودع البعيد!",
  "GIT_CLONE_ERROR_EXPLAIN": "المجلد المحدد `{0}`",
  "FOLDER_NOT_WRITABLE": "المجلد المحدد `{0}`",
  "GIT_NOT_FOUND_MESSAGE": "لم يتم تثبيت Git أو لا يمكن العثور عليه على نظامك. يُرجى تثبيت Git أو توفير المسار الصحيح لملف Git القابل للتنفيذ في حقل النص أدناه.",
  "ERROR_GETTING_BRANCH_LIST": "فشل الحصول على قائمة الفروع",
  "ERROR_READING_GIT_HEAD": "فشل قراءة ملف .git/HEAD",
  "ERROR_PARSING_BRANCH_NAME": "فشل تحليل اسم الفرع من {0}",
  "ERROR_READING_GIT_STATE": "فشل قراءة حالة .git",
  "ERROR_GETTING_DELETED_FILES": "فشل الحصول على قائمة الملفات المحذوفة",
  "ERROR_SWITCHING_BRANCHES": "فشل تبديل الفروع",
  "ERROR_GETTING_CURRENT_BRANCH": "فشل الحصول على اسم الفرع الحالي",
  "ERROR_REBASE_FAILED": "فشل إعادة التأسيس",
  "ERROR_MERGE_FAILED": "فشل الدمج",
  "ERROR_BRANCH_DELETE_FORCED": "فشل حذف الفرع بالقوة",
  "ERROR_FETCH_REMOTE_INFO": "فشل جلب معلومات عن بُعد",
  "ERROR_CREATE_BRANCH": "فشل إنشاء فرع جديد",
  "ERROR_REFRESH_GUTTER": "فشل تحديث الهامش!",
  "ERROR_GET_HISTORY": "فشل الحصول على السجل",
  "ERROR_GET_MORE_HISTORY": "فشل تحميل المزيد من صفوف السجل",
  "ERROR_GET_CURRENT_BRANCH": "فشل الحصول على اسم الفرع الحالي",
  "ERROR_GET_DIFF_FILE_COMMIT": "فشل الحصول على diff",
  "ERROR_GET_DIFF_FILES": "فشل تحميل قائمة ملفات diff",
  "ERROR_MODIFY_GITIGNORE": "فشل تعديل .gitignore",
  "ERROR_UNDO_LAST_COMMIT_FAILED": "تعذر التراجع عن آخر عملية ارتكاب",
  "ERROR_MODIFY_FILE_STATUS_FAILED": "فشل تعديل حالة الملف",
  "ERROR_CHANGE_USERNAME_FAILED": "تعذر تغيير اسم المستخدم",
  "ERROR_CHANGE_EMAIL_FAILED": "تعذر تغيير بريد المستخدم الإلكتروني",
  "ERROR_TOGGLE_GERRIT_PUSH_REF_FAILED": "تعذر تبديل مرجع دفع Gerrit",
  "ERROR_RESET_LOCAL_REPO_FAILED": "فشل إعادة ضبط المستودع المحلي",
  "ERROR_CREATE_TAG": "فشل إنشاء وسم",
  "ERROR_CODE_INSPECTION_FAILED": "فشل تنفيذ CodeInspection.inspectFile للملف",
  "ERROR_CANT_GET_STAGED_DIFF": "تعذر الحصول على فرق الملفات المرحلية",
  "ERROR_STAGE_FAILED": "فشل تجهيز الملفات في Git",
  "ERROR_GIT_COMMIT_FAILED": "فشل عملية الـ Git Commit",
  "ERROR_GIT_BLAME_FAILED": "فشل عملية Git Blame",
  "ERROR_GIT_DIFF_FAILED": "فشل مُقارنة Git",
  "ERROR_DISCARD_CHANGES_FAILED": "فشل تجاهل تغييرات الملف",
  "ERROR_COULD_NOT_RESOLVE_FILE": "تعذر حل الملف",
  "ERROR_MERGE_ABORT_FAILED": "فشل إحباط الدمج",
  "ERROR_MODIFIED_DIALOG_FILES": "تم تعديل الملفات التي كنت ستجري لها التزام أثناء عرض مربع حوار الالتزام. يتم إحباط الالتزام لأن النتيجة ستكون مختلفة عما تم عرضه في مربع الحوار.",
  "ERROR_GETTING_REMOTES": "فشل الحصول على المستودعات البعيدة!",
  "ERROR_REMOTE_CREATION": "فشل إنشاء المستودع البعيد",
  "ERROR_PUSHING_REMOTE": "فشل الدفع إلى المستودع البعيد",
  "ERROR_PULLING_REMOTE": "فشل السحب من المستودع البعيد",
  "ERROR_PULLING_OPERATION": "فشل عملية السحب",
  "ERROR_PUSHING_OPERATION": "فشل عملية الدفع",
  "ERROR_NO_REMOTE_SELECTED": "لم يتم تحديد جهاز تحكم عن بعد لـ {0}!",
  "ERROR_BRANCH_LIST": "فشل عملية الحصول على قائمة الفروع",
  "ERROR_FETCH_REMOTE": "فشل جلب معلومات جهاز التحكم عن بعد",
  "ERROR_PREPARING_COMMIT_DIALOG": "فشل تحضير مربع حوار الالتزام",
  "GIT_TOAST_TITLE": "استكشف ميزات Git في Phoenix Code",
  "GIT_TOAST_MESSAGE": "انقر على أيقونة لوحة Git لإدارة مستودعك. قم بسهولة بعمل commit، وpush، وpull، وعرض تاريخ مشروعك—كل ذلك في مكان واحد.<br><a href='https://docs.phcode.dev/app-links/git'>تعلم المزيد عن لوحة Git →</a>",
  "SURVEY_TITLE_VOTE_FOR_FEATURES_YOU_WANT": "صوت للميزات التي ترغب برؤيتها تالياً!",
  "SIGNED_OUT": "تم تسجيل خروجك.",
  "SIGNED_OUT_MESSAGE": "تم تسجيل خروجك من حساب {APP_NAME} الخاص بك. يُرجى تسجيل الدخول مرة أخرى للمتابعة.",
  "SIGNED_OUT_MESSAGE_FRIENDLY": "شكرًا لك على استخدام {APP_NAME}. نلتقي قريبًا!",
  "SIGNED_IN_OFFLINE_TITLE": "غير متصل - لا يمكن تسجيل الدخول",
  "SIGNED_IN_OFFLINE_MESSAGE": "يُرجى الاتصال بالإنترنت لتسجيل الدخول إلى {APP_NAME}.",
  "SIGNED_IN_FAILED_TITLE": "لا يمكن تسجيل الدخول",
  "SIGNED_IN_FAILED_MESSAGE": "حدث خطأ ما أثناء محاولة تسجيل الدخول. يُرجى المحاولة مرة أخرى.",
  "SIGNED_OUT_FAILED_TITLE": "فشل تسجيل الخروج",
  "SIGNED_OUT_FAILED_MESSAGE": "حدث خطأ أثناء تسجيل الخروج. اضغط موافق لفتح <a href='https://account.phcode.dev/#advanced'>account.phcode.dev</a> حيث يمكنك تسجيل الخروج يدويًا.",
  "VALIDATION_CODE_TITLE": "رمز التحقق لتسجيل الدخول",
  "VALIDATION_CODE_MESSAGE": "الرجاء استخدام رمز التحقق هذا لتسجيل الدخول إلى حساب {APP_NAME} الخاص بك:",
  "COPY_VALIDATION_CODE": "نسخ الرمز",
  "VALIDATION_CODE_COPIED": "تم النسخ",
  "OPEN_SIGN_IN_URL": "فتح صفحة تسجيل الدخول",
  "PROFILE_POP_TITLE": "حساب {APP_NAME}",
  "PROFILE_SIGN_IN": "تسجيل الدخول إلى حسابك",
  "CONTACT_SUPPORT": "تواصل مع الدعم",
  "SIGN_OUT": "تسجيل الخروج",
  "SIGN_IN": "تسجيل الدخول",
  "ACCOUNT_DETAILS": "تفاصيل الحساب",
  "LOGIN_REFRESH": "تحقق من حالة تسجيل الدخول",
  "SIGN_IN_WAITING_TITLE": "جارٍ انتظار تسجيل الدخول",
  "SIGN_IN_WAITING_MESSAGE": "يُرجى إكمال تسجيل الدخول في علامة التبويب الجديدة، ثم العودة إلى هنا.",
  "WAITING_FOR_LOGIN": "جارٍ انتظار تسجيل الدخول…",
  "CHECK_NOW": "تحقق الآن",
  "CHECKING": "جارٍ التحقق…",
  "CHECKING_STATUS": "جارٍ التحقق من حالة تسجيل الدخول…",
  "NOT_SIGNED_IN_YET": "لم يتم تسجيل الدخول بعد. يُرجى إكمال تسجيل الدخول في علامة التبويب الأخرى.",
  "WELCOME_BACK": "أهلاً بعودتك",
  "WELCOME_BACK_USER": "أهلاً بعودتك، {0}!",
  "POPUP_BLOCKED": "تم حظر النافذة المنبثقة. يُرجى السماح بالنوافذ المنبثقة وإعادة المحاولة، أو الانتقال يدويًا إلى {0}",
  "COLLAPSE_ALL_FOLDERS": "طي جميع المجلدات",
  "CUSTOM_SNIPPETS_MENU_ITEM_NAME": "مقتطفات مخصصة…",
  "CUSTOM_SNIPPETS_PANEL_TITLE": "مقتطفات مخصصة",
  "CUSTOM_SNIPPETS_ADD_PANEL_TITLE": "إضافة مقتطف برمجي",
  "CUSTOM_SNIPPETS_EDIT_PANEL_TITLE": "تعديل مقتطف برمجي",
  "CUSTOM_SNIPPETS_ADD_NEW_TITLE": "إضافة مقتطف جديد",
  "CUSTOM_SNIPPETS_BACK_TO_LIST_TITLE": "الرجوع إلى قائمة المقتطفات",
  "CUSTOM_SNIPPETS_BACK": "رجوع",
  "CUSTOM_SNIPPETS_FILTER_PLACEHOLDER": "بحث...",
  "CUSTOM_SNIPPETS_NO_SNIPPETS_MESSAGE": "لم تتم إضافة أي مقتطفات مخصصة حتى الآن!",
  "CUSTOM_SNIPPETS_ADD_SNIPPET_BTN": "إضافة مقتطف",
  "CUSTOM_SNIPPETS_ABBREVIATION_LABEL": "الاختصار:",
  "CUSTOM_SNIPPETS_TEMPLATE_TEXT_LABEL": "نص القالب:",
  "CUSTOM_SNIPPETS_DESCRIPTION_LABEL": "الوصف:",
  "CUSTOM_SNIPPETS_FILE_EXTENSION_LABEL": "امتداد الملف:",
  "CUSTOM_SNIPPETS_CANCEL": "إلغاء",
  "CUSTOM_SNIPPETS_SAVE": "حفظ",
  "CUSTOM_SNIPPETS_NO_DESCRIPTION": "بدون وصف",
  "CUSTOM_SNIPPETS_NO_MATCHES": "لا توجد مُقتطفات مُطابقة لـ \"{0}\"",
  "CUSTOM_SNIPPETS_LEARN_MORE": "أضف تلميحات الكود الخاصة بك لتسريع عملية كتابة الكود - <a href=\"https://docs.phcode.dev/app-links/custom-snippets\" target=\"_blank\">اعرف المزيد</a>",
  "CUSTOM_SNIPPETS_DUPLICATE_ERROR": "يوجد مُقتطف برمز مختصر \"{0}\" مُسبقًا.",
  "CUSTOM_SNIPPETS_SPACE_ERROR": "المسافة غير مقبولة كحرف اختصار صالح.",
  "CUSTOM_SNIPPETS_ABBR_LENGTH_ERROR": "لا يُمكن أن يتجاوز الاختصار ٣٠ حرفًا.",
  "CUSTOM_SNIPPETS_DESC_LENGTH_ERROR": "لا يمكن أن يتجاوز الوصف ٨٠ حرفًا.",
  "CUSTOM_SNIPPETS_HINT_LABEL": "مقتطف برمجي",
  "CUSTOM_SNIPPETS_EDIT_ABBR_TOOLTIP": "انقر لتحرير الاختصار - {0}",
  "CUSTOM_SNIPPETS_EDIT_TEMPLATE_TOOLTIP": "انقر لتحرير نص القالب -",
  "CUSTOM_SNIPPETS_EDIT_DESC_TOOLTIP": "انقر لتحرير الوصف - {0}",
  "CUSTOM_SNIPPETS_ADD_DESC_TOOLTIP": "انقر لإضافة وصف",
  "CUSTOM_SNIPPETS_EDIT_FILE_EXT_TOOLTIP": "انقر لتحرير امتدادات الملفات - {0}",
  "CUSTOM_SNIPPETS_ABBR_INPUT_TOOLTIP": "أدخل اختصارًا قصيرًا (مثل: 'clg'، 'fn'، 'div'). هذا ما ستكتبه لتنشيط المقتطف البرمجي.",
  "CUSTOM_SNIPPETS_DESC_INPUT_TOOLTIP": "وصف موجز لما يفعله هذا المقتطف البرمجي. اتركه فارغًا إذا لم يكن الوصف مطلوبًا.",
  "CUSTOM_SNIPPETS_FILE_EXT_INPUT_TOOLTIP": "حدد أنواع الملفات التي يجب أن يكون هذا المقتطف البرمجي متاحًا لها (مثل: '.js'، '.html'، '.css'). اتركه فارغًا لجعله متاحًا لجميع الملفات.",
  "CUSTOM_SNIPPETS_TEMPLATE_INPUT_TOOLTIP": "نص الكود الذي سيتم إدراجه. استخدم ${1}، ${2}، ${3}، إلخ. لمواقع المؤشر. ${1} هو الموقع الابتدائي، ينتقل Tab إلى ${2}، ${3}، إلخ. ${0} هو الموقع النهائي.",
  "CUSTOM_SNIPPETS_DESC_PLACEHOLDER": "اختصار لـ console log (اختياري)",
  "CUSTOM_SNIPPETS_FILE_EXT_PLACEHOLDER": "اتركه فارغًا لجميع الملفات، أو حدده مثل .js، .html",
  "CUSTOM_SNIPPETS_TEMPLATE_PLACEHOLDER": "console.log(${1});",
  "CUSTOM_SNIPPETS_HEADER_ABBREVIATION": "اختصار",
  "CUSTOM_SNIPPETS_HEADER_TEMPLATE": "نص القالب",
  "CUSTOM_SNIPPETS_HEADER_DESCRIPTION": "الوصف",
  "CUSTOM_SNIPPETS_HEADER_FILE_EXTENSION": "امتداد الملف",
  "PROMO_UPGRADE_TITLE": "تم ترقيتك إلى {0}",
  "PROMO_UPGRADE_MESSAGE": "استمتع بالوصول إلى هذه الميزات المميزة للأيام الـ {0} القادمة:",
  "PROMO_CARD_1": "التعديل في المعاينة المباشرة",
  "PROMO_CARD_1_MESSAGE": "عدّل المحتوى والعناصر مباشرة في المعاينة المباشرة - قص، نسخ، لصق، تكرار، حذف - دون مقاطعة سير عملك.",
  "PROMO_CARD_2": "سحب وإفلات العناصر",
  "PROMO_CARD_2_MESSAGE": "أعد ترتيب الأقسام بصريًا - جرب المزيد من أفكار التخطيط في ثوانٍ، وليس في دقائق من كتابة الأكواد.",
  "PROMO_CARD_3": "مكتبة الصور الجاهزة",
  "PROMO_CARD_3_MESSAGE": "تصفح الصور الخالية من حقوق الملكية - مرر الفأرة للمعاينة الفورية، وانقر للتطبيق. جرب المزيد من الخيارات، بشكل أسرع.",
  "PROMO_CARD_4": "فحص تخطيط العنصر",
  "PROMO_CARD_4_MESSAGE": "صمّم وافحص في عرض واحد - مرر الفأرة لرؤية التباعد والأبعاد والفئات. أدلة المسطرة لمحاذاة دقيقة بالبكسل.",
  "PROMO_LEARN_MORE": "تعرّف على المزيد…",
  "PROMO_UPGRADE_APP_UPSELL_BUTTON": "الترقية إلى {0}",
  "PROMO_PRO_ENDED_TITLE": "انتهت الفترة التجريبية لـ {0}",
  "PROMO_PHOENIX_PRO_ENDED_MESSAGE": "شكرًا لتجربتك إصدار Pro! <b>أنت الآن تستخدم الإصدار المجاني للمجتمع.</b> <br>قم بالترقية في أي وقت لإلغاء قفل هذه الميزات:",
  "PROMO_PRO_UNLOCK_PRO_TITLE": "أطلق العنان لقوة {0}",
  "PROMO_PRO_CONTINUE_ON_FREE": "المتابعة على الإصدار المجاني",
  "PROMO_PRO_UNLOCK_LIVE_EDIT_TITLE": "افتح ميزة التحرير المباشر مع {0}",
  "PROMO_PRO_UNLOCK_MESSAGE": "اشترك الآن لإلغاء قفل هذه الميزات المتقدمة:",
  "PROMO_PRO_TRIAL_DAYS_LEFT": "النسخة التجريبية من Phoenix Pro ({0} أيام متبقية)",
  "PRO_TRIAL_ENDING_TITLE": "ترقية {0} الخاصة بك تنتهي خلال {1} أيام",
  "PRO_TRIAL_ENDING_TITLE_TOMORROW": "ترقية {0} الخاصة بك تنتهي غدًا",
  "PRO_TRIAL_ENDING_MESSAGE": "سنقوم تلقائيًا <b>بتحويلك إلى الإصدار المجاني للمجتمع</b> خلال {0} أيام. <br>قم بالترقية الآن لمواصلة استخدام ميزات Pro هذه:",
  "PRO_TRIAL_ENDING_MESSAGE_TOMORROW": "سنقوم تلقائيًا <b>بتحويلك إلى الإصدار المجاني للمجتمع</b> غدًا. <br>قم بالترقية الآن لمواصلة استخدام ميزات Pro هذه:",
  "GET_PRO_NOT_NOW": "ليس الآن",
  "GET_PHOENIX_PRO": "احصل على Phoenix Pro",
  "MANAGE_LICENSE_DIALOG_TITLE": "إدارة ترخيص الجهاز",
  "LICENSE_KEY": "مفتاح الترخيص",
  "LICENSE_KEY_PLACEHOLDER": "أدخل مفتاح ترخيصك…",
  "LICENSE_KEY_ACTIVATE": "تفعيل الترخيص",
  "LICENSE_KEY_ACTIVATING": "جارٍ التفعيل...",
  "LICENSE_KEY_CURRENT": "ترخيص الجهاز الحالي",
  "LICENSE_KEY_CHECKING": "جارٍ التحقق من حالة الترخيص...",
  "LICENSE_KEY_NONE": "لم يتم العثور على ترخيص جهاز نشط",
  "LICENSE_STATUS_ACTIVE": "نشط",
  "LICENSE_INFO_STATUS_LABEL": "الحالة:",
  "LICENSE_INFO_LICENSED_TO_LABEL": "مرخص لـ:",
  "LICENSE_INFO_TYPE_LABEL": "نوع الترخيص:",
  "LICENSE_INFO_VALID_UNTIL_LABEL": "صالح حتى:",
  "LICENSE_CHECK_ERROR": "خطأ في التحقق من حالة الترخيص",
  "LICENSE_STATUS_UNKNOWN": "غير معروف",
  "LICENSE_VALID_NEVER": "أبداً",
  "LICENSE_STATUS_ERROR_CHECK": "خطأ في التحقق من حالة الترخيص",
  "LICENSE_ACTIVATE_SUCCESS": "تم تفعيل الترخيص على مستوى النظام. يرجى إعادة تشغيل {APP_NAME} لتصبح التغييرات سارية المفعول.",
  "LICENSE_ACTIVATE_SUCCESS_PARTIAL": "تم تفعيل الترخيص لحسابك فقط (وليس على مستوى النظام). يرجى إعادة تشغيل {APP_NAME} لتصبح التغييرات سارية المفعول.",
  "LICENSE_ACTIVATE_FAIL": "فشل تفعيل الترخيص",
  "LICENSE_ACTIVATE_FAIL_APPLY": "فشل تطبيق الترخيص على الجهاز",
  "LICENSE_ENTER_KEY": "الرجاء إدخال مفتاح الترخيص",
  "LICENSE_REAPPLY_TO_DEVICE": "تم التنشيط بالفعل؟ إعادة التطبيق على مستوى النظام",
  "DEPRECATED_EXTENSIONS_TITLE": "تم اكتشاف ملحقات مهملة",
  "DEPRECATED_EXTENSIONS_MESSAGE": "الملحقات المثبتة التالية أصبحت الآن مدعومة بشكل أصلي بواسطة {APP_NAME} ويمكن إلغاء تثبيتها بأمان من مدير الملحقات:",
  "DEPRECATED_EXTENSIONS_LEARN_MORE": "مدمج الآن — اعرف المزيد",
  "AI_LOGIN_DIALOG_TITLE": "تسجيل الدخول لاستخدام تعديلات الذكاء الاصطناعي",
  "AI_LOGIN_DIALOG_MESSAGE": "يرجى تسجيل الدخول لاستخدام التعديلات المدعومة بالذكاء الاصطناعي",
  "AI_LOGIN_DIALOG_BUTTON": "الحصول على وصول للذكاء الاصطناعي",
  "AI_DISABLED_DIALOG_TITLE": "الذكاء الاصطناعي معطل",
  "AI_CONTROL_ALL_ALLOWED_NO_CONFIG": "لم يتم العثور على ملف تكوين الذكاء الاصطناعي في النظام. الذكاء الاصطناعي ممكّن لجميع المستخدمين.",
  "AI_CONTROL_ALL_ALLOWED": "الذكاء الاصطناعي ممكّن لجميع المستخدمين.",
  "AI_CONTROL_USER_ALLOWED": "الذكاء الاصطناعي ممكّن للمستخدم ({0}) ولكنه معطل للآخرين",
  "AI_CONTROL_ADMIN_DISABLED": "قام مسؤول النظام بتعطيل الوصول إلى الذكاء الاصطناعي",
  "AI_CONTROL_ADMIN_DISABLED_CONTACT": "قام مسؤول النظام بتعطيل الوصول إلى الذكاء الاصطناعي. يرجى الاتصال بـ {0} للحصول على المساعدة.",
  "AI_UPSELL_DIALOG_TITLE": "المتابعة باستخدام {0}؟",
  "AI_UPSELL_DIALOG_MESSAGE": "لقد اكتشفت {0}. للمتابعة، ستحتاج إلى اشتراك في الذكاء الاصطناعي أو أرصدة.",
  "DEMO_SECTION1_TITLE": "تعديل في المعاينة المباشرة",
  "DEMO_SECTION1_SUBTITLE": "عدّل صفحتك بصريًا -&nbsp; <b>يتم تحديث HTML الخاص بك فورًا</b>",
  "DEMO_GET_STARTED_BUTTON": "ابدأ",
  "DEMO_SECTION2_TITLE": "تعديل النص",
  "DEMO_SECTION2_SUBTITLE": "انقر مرتين لتعديل النص أدناه وأضف اسمك",
  "DEMO_EDITABLE_PLACEHOLDER_HELLO": "مرحبًا ___",
  "DEMO_SECTION2_SUCCESS_MESSAGE": "لقد حدّث تعديلك الكود — تراجع باستخدام <span id=\"undo-shortcut\"></span>، وإعادة باستخدام <span id=\"redo-shortcut\"></span>.",
  "DEMO_HINT_COMPLETE_TASK_LABEL": "لإكمال هذه المهمة:",
  "DEMO_SECTION2_HINT_STEP1": "انقر مرتين على نص \"مرحبًا ___\"",
  "DEMO_SECTION2_HINT_STEP2": "استبدل الشرطات السفلية باسمك",
  "DEMO_SECTION2_HINT_STEP3": "اضغط على Enter أو انقر بالخارج لتطبيق تغييراتك",
  "DEMO_SECTION3_TITLE": "تغيير الصور مباشرةً",
  "DEMO_SECTION3_SUBTITLE": "انقر على الصورة أدناه لاستبدالها بواحدة تعجبك من مكتبة الصور.",
  "DEMO_SECTION3_SUCCESS_URL": "هل تعلم أنه يمكنك تنزيل الصور باستخدام زر <img src=\"images/download.svg\" alt=\"Download\" class=\"inline-icon\"> التنزيل في مكتبة الصور؟",
  "DEMO_SECTION3_SUCCESS_LOCAL": "هل تعلم أنه يمكنك النقر على صورة لاستخدامها دون الحاجة إلى تنزيلها؟",
  "DEMO_SECTION3_HINT_STEP1": "انقر على الصورة أعلاه لفتح مكتبة الصور (انقر نقرًا مزدوجًا للتبديل)",
  "DEMO_SECTION3_HINT_STEP2": "في مكتبة الصور: مرّر مؤشر الفأرة فوق الصور المصغرة لمعاينتها",
  "DEMO_SECTION3_HINT_STEP3": "انقر على صورة مصغرة لوضعها في صفحتك، أو انقر على أيقونة <img src=\"images/download.svg\" alt=\"Download\" class=\"inline-icon\"> لتنزيلها أولاً",
  "DEMO_SECTION4_TITLE": "تعديل العناصر بصريًا",
  "DEMO_SECTION4_SUBTITLE": "كرّر<img src=\"images/duplicate.svg\" alt=\"Duplicate\" class=\"inline-icon\"> البطاقة أدناه ليصبح المجموع <strong>3 بطاقات</strong>، ثم <strong>احذف<img src=\"images/trash.svg\" alt=\"Delete\" class=\"inline-icon\"> بطاقة واحدة</strong>.",
  "DEMO_SECTION4_UNDO_WARNING": "عفوًا! تم حذف جميع البطاقات. اضغط على <strong><span id=\"undo-shortcut-section4\"></span></strong> للتراجع.",
  "DEMO_CARD_TITLE": "بطاقة",
  "DEMO_CARD_SELECT_PARENT_TIP": "انقر على أيقونة <img src=\"images/arrowUp.svg\" alt=\"Up\" class=\"inline-icon\">&nbsp;في شريط الأدوات أعلاه لتحديد البطاقة الأصل.",
  "DEMO_SECTION4_SUCCESS_MESSAGE": "ممتاز! لقد أتقنت تكرار العناصر وحذفها.",
  "DEMO_SECTION4_HINT_STEP1": "انقر على البطاقة لتحديدها",
  "DEMO_SECTION4_HINT_STEP2_DUPLICATE": "استخدم زر <img src=\"images/duplicate.svg\" alt=\"Duplicate\" class=\"inline-icon\"> أو اضغط على <strong><span id=\"duplicate-shortcut\"></span></strong> لتكرار البطاقات حتى يصبح لديك 3 بطاقات في المجموع",
  "DEMO_SECTION4_HINT_STEP3_DELETE": "حدد أي بطاقة واستخدم زر <img src=\"images/trash.svg\" alt=\"Delete\" class=\"inline-icon\"> أو اضغط على <strong>Delete</strong> لإزالتها",
  "DEMO_SECTION4_HINT_TIP_UNDO_REDO": "نصيحة: يمكنك التراجع باستخدام <strong><span id=\"undo-shortcut-hint\"></span></strong> والإعادة باستخدام <strong><span id=\"redo-shortcut-hint\"></span></strong>",
  "DEMO_DELETE_KEY": "حذف",
  "DEMO_SECTION5_TITLE": "إعادة ترتيب العناصر بالسحب",
  "DEMO_SECTION5_SUBTITLE": "اسحب أي ملاحظة لتغيير الترتيب.",
  "DEMO_STICKY_NOTE_FIRST_PLACE": "المركز الأول",
  "DEMO_STICKY_NOTE_SECOND_PLACE": "المركز الثاني",
  "DEMO_STICKY_NOTE_THIRD_PLACE": "المركز الثالث",
  "DEMO_SECTION5_SUCCESS_MESSAGE": "يمكنك سحب العناصر إلى أي مكان في الصفحة لإعادة ترتيبها.",
  "DEMO_SECTION5_HINT_STEP1": "انقر مع الاستمرار على أي ملاحظة لبدء السحب",
  "DEMO_SECTION5_HINT_STEP2": "حرّكها لأعلى أو لأسفل لتغيير الترتيب",
  "DEMO_SECTION5_HINT_STEP3": "أفلتها لوضعها في الموضع الجديد",
  "DEMO_SECTION6_TITLE": "تحرير الروابط ومعاينة صفحتك",
  "DEMO_SECTION6_SUBTITLE": "حدد أيقونة <img src=\"images/link.svg\" alt=\"Link\" class=\"inline-icon\"> في شريط الأدوات لتغيير وجهة هذا الرابط.",
  "DEMO_LINK_EDIT_LINK": "تعديل الرابط",
  "DEMO_SECTION6_SUCCESS_MESSAGE": "لقد قمت بتعديل رابط.",
  "DEMO_MODE_EXPLANATION_TITLE": "وضع التعديل مقابل وضع المعاينة",
  "DEMO_EDIT_MODE_LABEL": "وضع التعديل",
  "DEMO_EDIT_MODE_DESCRIPTION": "حدد الأشياء وغيّرها على الصفحة",
  "DEMO_PREVIEW_MODE_LABEL": "وضع المعاينة",
  "DEMO_PREVIEW_MODE_DESCRIPTION": "شاهد صفحتك كما سيراها الزوار",
  "DEMO_MODE_SWITCH_HINT": "اضغط على <strong>F8</strong> أو انقر على الأزرار <span class=\"play-button-hint\"><img src=\"images/playButton.svg\" alt=\"Play\" class=\"play-hint-svg svg-gold\"></span> لتبديل الأوضاع.",
  "DEMO_TIPS_LABEL": "نصائح:",
  "DEMO_SECTION6_TIP1": "انقر على أي رابط لتحديده للتعديل",
  "DEMO_SECTION6_TIP2_NEWTAB": "قم بتفعيل <strong>فتح في علامة تبويب جديدة</strong> لفتح الروابط في صفحة منفصلة",
  "DEMO_SECTION6_TIP3_PREVIEW": "انتقل إلى وضع المعاينة (<strong>F8</strong>) لاختبار الروابط والتفاعلات",
  "DEMO_COMPLETION_TITLE": "أنت الآن جاهز للإنشاء!",
  "DEMO_COMPLETION_BODY": "لقد تعلمت كيفية التحرير باستخدام المعاينة المباشرة.<br>افتح مجلداً يحتوي على ملفات HTML الخاصة بك لبدء التحرير.",
  "DEMO_COMPLETION_HELP_PROMPT": "هل تحتاج إلى المزيد من المساعدة؟",
  "DEMO_RESOURCE_YOUTUBE": "يوتيوب",
  "DEMO_RESOURCE_DOCUMENTATION": "التوثيق",
  "DEMO_BONUS_BADGE": "شيء آخر",
  "DEMO_SECTION8_TITLE": "التحقق من التخطيط باستخدام القياسات",
  "DEMO_SECTION8_SUBTITLE": "انقر على <img src=\"images/verticalEllipsis.svg\" alt=\"menu\" class=\"inline-icon\"> في شريط الأدوات وحدد <strong>إظهار القياسات</strong> لمعرفة أي مربع ليس في موضعه الصحيح.",
  "DEMO_BOX_CLICK_MENU": "انقر على <img src=\"images/verticalEllipsis.svg\" alt=\"menu\" class=\"inline-icon\">",
  "DEMO_BOX_LABEL": "مربع",
  "DEMO_SECTION8_TIP1": "انقر على أيقونة <img src=\"images/verticalEllipsis.svg\" alt=\"More options\" class=\"inline-icon\"> في شريط الأدوات، أو انقر بزر الماوس الأيمن لفتح القائمة",
  "DEMO_SECTION8_TIP2_MEASUREMENTS": "مكّن <strong>إظهار القياسات</strong> لرؤية أدلة التباعد والمحاذاة",
  "DEMO_SECTION8_TIP3": "تساعدك القياسات على اكتشاف مشكلات المحاذاة بسرعة",
  "DEMO_ALT_EDIT_TEXT": "تحرير النص",
  "DEMO_ALT_IMAGE_LIBRARY": "مكتبة الصور",
  "DEMO_ALT_DRAG_AND_DROP": "السحب والإفلات",
  "DEMO_ALT_LAYOUT_RULERS": "مساطر التخطيط",
  "DEMO_ALT_REPLACEABLE_IMAGE": "صورة قابلة للاستبدال",
  "DEMO_ALT_DOWNLOAD_ICON": "تنزيل",
  "DEMO_ALT_DUPLICATE_ICON": "تكرار",
  "DEMO_ALT_DELETE_ICON": "حذف",
  "DEMO_ALT_UP_ICON": "أعلى",
  "DEMO_ALT_LINK_ICON": "رابط",
  "DEMO_ALT_PLAY_ICON": "تشغيل",
  "DEMO_ALT_MENU_ICON": "قائمة",
  "DEMO_ALT_MORE_OPTIONS_ICON": "المزيد من الخيارات",
  "DEMO_ALT_CARD_IMAGE": "صورة البطاقة",
  "DEMO_ALT_ROCKET": "صاروخ",
  "DEMO_ALT_ARROW": "سهم",
  "DEMO_JS_BUTTON_BACK": "رجوع",
  "DEMO_JS_BUTTON_PREVIOUS": "السابق",
  "DEMO_JS_BUTTON_NEXT": "التالي",
  "DEMO_JS_BUTTON_TIP": "تلميح",
  "DEMO_JS_BUTTON_FINISH": "إنهاء",
  "DEMO_JS_BUTTON_ONE_MORE": "شيء آخر",
  "DEMO_JS_BUTTON_START_AGAIN": "البدء من جديد",
  "DEMO_JS_CARD_COUNT_TEMPLATE": "{NUM_DONE}/3 بطاقات",
  "DEMO_JS_DELETE_COUNT_TEMPLATE": "{NUM_DONE}/1 محذوف",
  "DEMO_CLICK_TO_REPLACE_IMAGE": "انقر للاستبدال"
});