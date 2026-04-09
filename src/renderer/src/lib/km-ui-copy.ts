import { activeEnUiCopy, enUiCopyV1 } from './ui-copy-map';

type TranslationKey = keyof typeof enUiCopyV1;

const directKeyTranslations: Partial<Record<TranslationKey, string>> = {
  appTitle: 'បញ្ជី កុំព្យូទ័រ',
  appBrand: 'បញ្ជី',
  backendStarting: 'កំពុងចាប់ផ្តើមផ្នែកក្នុងម៉ាស៊ីន…',
  backendReady: 'កន្លែងធ្វើការក្នុងម៉ាស៊ីនរបស់ Banji រួចរាល់',
  backendError: 'កន្លែងធ្វើការក្នុងម៉ាស៊ីនរបស់ Banji មិនអាចប្រើបាន',
  workspaceLoadingTitle: 'កំពុងផ្ទុកកន្លែងធ្វើការក្នុងម៉ាស៊ីន…',
  workspaceStarting: 'កំពុងចាប់ផ្តើមផ្នែកក្នុងម៉ាស៊ីន និងផ្ទុកស្ថានភាពចុងក្រោយ។',
  workspaceComputingTitle: 'Banji កំពុងរៀបចំទិន្នន័យសម្រាប់កន្លែងធ្វើការរបស់អ្នក',
  workspaceComputingBody:
    'Banji កំពុងផ្ទុកកាតាឡុក ភស្តុតាងថ្មីៗ និងការវិភាគចុងក្រោយក្នុងម៉ាស៊ីន។',
  workspaceComputingHint:
    'ការបើកលើកដំបូងបន្ទាប់ពីកំណត់ឡើងវិញ ឬវិភាគម្តងទៀត អាចចំណាយពេលបន្ថែមបន្តិច ខណៈ Banji កំពុងសង់ទិដ្ឋភាពថ្មីៗឡើងវិញ។',
  workspaceUnavailable: 'កន្លែងធ្វើការក្នុងម៉ាស៊ីនមិនអាចប្រើបាន។',
  overviewBody:
    'មើលអ្វីដែលត្រូវយកចិត្តទុកដាក់ឥឡូវនេះ អ្វីដែលបានផ្លាស់ប្តូរថ្មីៗ និងអ្វីដែលត្រូវធ្វើបន្ទាប់។',
  overviewSupportPromptBody:
    'ទំព័រ Overview សម្រាប់សកម្មភាពបន្ទាប់ក្នុងការងារ។ ការកែប្រែ កំណត់ហេតុ និងផែនការមាននៅកន្លែងផ្សេង។',
  overviewDecisionSupportCatalogTitle: 'ការធ្វើផែនការចាប់ផ្តើមបន្ទាប់ពីមានកាតាឡុក',
  overviewDecisionSupportCatalogBody:
    'បន្ថែម SKU ដំបូង ដើម្បីឲ្យ Banji អាចបង្កើតការងារពីស្តុកពិត និងសកម្មភាពសេវាកម្ម។',
  overviewDecisionSupportRiskTitle: 'សេចក្តីសង្ខេបហានិភ័យបច្ចុប្បន្ន',
  overviewDecisionSupportRiskBody:
    'ផែនការគឺជាជំហានបន្ទាប់ ព្រោះហានិភ័យស្តុក និងសម្ពាធបញ្ជាទិញបន្ថែមកំពុងកើនឡើងជាមួយគ្នា។',
  overviewDecisionSupportReorderTitle: 'សម្ពាធកំពុងកើនមុនហានិភ័យឡើងខ្ពស់',
  overviewDecisionSupportReorderBody:
    'សម្ពាធបញ្ជាទិញបន្ថែមកំពុងកើនឡើង។ ពិនិត្យអាទិភាពឥឡូវនេះ មុនពេល SKU ច្រើនទៀតក្លាយជាបន្ទាន់។',
  overviewDecisionSupportFirstReportTitle: 'កាតាឡុកត្រូវការការអាប់ដេតពិតលើកដំបូង',
  overviewDecisionSupportFirstReportBody:
    'កាតាឡុករួចរាល់ហើយ ប៉ុន្តែ Banji នៅតែត្រូវការការអាប់ដេតពិតមួយ មុនពេលអាចទុកចិត្តលើស្ថានភាពបច្ចុប្បន្នបាន។',
  overviewDecisionSupportSteadyTitle: 'ស្ថានភាពចុងក្រោយមើលទៅមានស្ថិរភាព',
  overviewDecisionSupportSteadyBody:
    'មិនមានអ្វីបន្ទាន់កំពុងរង់ចាំទេ។ ជំហានបន្ទាប់ល្អបំផុត គឺកត់ត្រាការអាប់ដេតស្តុកបន្ទាប់ ហើយរក្សា Overview ឲ្យទាន់សម័យ។',
  overviewPrimaryAddFirstSkuDescription:
    'បង្កើត SKU ដំបូង ដើម្បីឲ្យ Banji ចាប់ផ្តើមតាមដានស្តុក សេវាកម្ម និងផែនការ។',
  overviewPrimaryStartFirstUpdateDescription:
    'កត់ត្រាការអាប់ដេតស្តុកលើកដំបូង ដើម្បីឲ្យ Banji អាចបង្កើតការងារពីភស្តុតាងថ្មីៗ។',
  overviewPrimaryReviewReorderPrioritiesDescription:
    'ពិនិត្យ SKU ដែលមានសម្ពាធខ្លាំងបំផុត មុនពេលសេចក្តីសម្រេចស្តុកបន្ទាប់យឺតពេល។',
  overviewPrimaryStartUpdateSessionDescription:
    'បើកលំហូរអាប់ដេតដែលមានការណែនាំ ដើម្បីកត់ត្រាស្ថានភាពស្តុកបន្ទាប់។',
  overviewOpenCatalogDescription: 'ពិនិត្យកាតាឡុក ឬបន្ថែម SKU ឬសេវាកម្មថ្មី។',
  overviewOpenOperationsDescription: 'ពិនិត្យការអាប់ដេតដែលបានរក្សាទុក ឬចាប់ផ្តើមមួយថ្មី។',
  overviewOpenPlanningDescription: 'ពិនិត្យអាទិភាពលក់ និងសម្ពាធបញ្ជាទិញបន្ថែមជាមួយគ្នា។',
  overviewReviewRecentActivityDescription:
    'បើកកំណត់ហេតុដើម្បីពិនិត្យការអាប់ដេតចុងក្រោយដែលបានរក្សាទុក ហើយបន្តពីទីនោះ។',
  overviewNeedsAttentionDescription:
    'ដាក់ហានិភ័យស្តុក និងសម្ពាធបញ្ជាទិញបន្ថែមដែលខ្លាំងបំផុតឡើងមុន ដើម្បីឲ្យការសម្រេចចិត្តបន្ទាប់ច្បាស់។',
  overviewPlanningQueueDescription:
    'ប្រើជួរនេះ ដើម្បីមើលអ្វីដែលត្រូវពិនិត្យបន្ទាប់ ហេតុអ្វីវាសំខាន់ឥឡូវនេះ និង SKU មួយណាគួរធ្វើមុន។',
  overviewQueueFilterDescription:
    'តម្រងជួរ ដើម្បីផ្តោតលើប្រភេទបញ្ហាមួយម្តងៗ។',
  overviewQueueDecisionImmediate: 'ទំនងជាអស់ស្តុកក្នុង {days} ថ្ងៃ។ បញ្ជាទិញឥឡូវនេះ។',
  overviewQueueDecisionImmediateUnknownCover: 'ទំនងជាអស់ស្តុកឆាប់ៗនេះ។ បញ្ជាទិញឥឡូវនេះ។',
  overviewQueueDecisionElevated: 'ហានិភ័យអស់ស្តុកកំពុងខ្ពស់។ ពិនិត្យឥឡូវនេះ។',
  overviewQueueDecisionPressure: 'ចំណុចបញ្ជាទិញបន្ថែមកំពុងតានតឹង។ ពិនិត្យការបំពេញស្តុក។',
  overviewQueueDecisionWatch: 'តម្រូវការដែលភ្ជាប់គ្នាត្រូវការពិនិត្យ។ តាមដាន SKU នេះ។',
  overviewQueueNoFilterMatchesDescription:
    'សាកល្បងប្រភេទបញ្ហាផ្សេង ដើម្បីឲ្យការសម្រេចចិត្តបន្ទាប់ត្រឡប់មកមើលឃើញវិញ។',
  overviewQueueReorderPressureDescription:
    'សញ្ញាផែនការនៅតែសកម្ម ទោះមិនមានជួរខាងលើក៏ដោយ។ បើកជួរបញ្ជាទិញបន្ថែម ដើម្បីបញ្ជាក់ថាអ្វីគួរធ្វើមុន។',
  overviewQueueHealthyDescription:
    'ឥឡូវនេះមិនមានសេចក្តីសម្រេចអំពីការបញ្ជាទិញបន្ថែម ឬផលប៉ះពាល់លើសេវាកម្មដែលបន្ទាន់ទេ។ បន្តកត់ត្រា ឬរៀបចំកាតាឡុកបន្ត។',
  overviewRecentActivityDescription:
    'មើលអ្វីដែលបានផ្លាស់ប្តូរថ្មីៗបំផុត ក្នុងការអាប់ដេតស្តុក ការផ្លាស់ប្តូរតម្លៃ និងសញ្ញាលំដាប់លក់។',
  overviewRecentActivityFallback:
    'មិនអាចផ្ទុកសកម្មភាពថ្មីៗបានឥឡូវនេះទេ។ ផ្នែកផ្សេងទៀតនៃ Overview នៅតែអាចប្រើបាន។',
  overviewRecentActivityEmpty:
    'មិនទាន់មានរបាយការណ៍ស្តុកនៅឡើយទេ។ ចាប់ផ្តើមវគ្គអាប់ដេតដំបូង នៅពេលស្តុករួចរាល់។',
  overviewQuickActionsDescription:
    'រក្សាបញ្ជីនេះឲ្យខ្លី ដើម្បីឲ្យ Overview ផ្តោតលើសកម្មភាព មិនមែនការរៀបចំ។',
  overviewQuickActionOperationsDescription: 'កត់ត្រាការអាប់ដេតស្តុកបន្ទាប់។',
  overviewQuickActionCatalogDescription: 'ពិនិត្យកាតាឡុក ឬបង្កើតធាតុថ្មី។',
  overviewQuickActionPlanningDescription: 'ពិនិត្យអាទិភាពលក់ និងបរិបទបញ្ជាទិញបន្ថែម។',
  overviewSupportMetricsDescription:
    'ប្រើសូចនាករទាំងនេះជាព័ត៌មានគាំទ្រ បន្ទាប់ពីផ្នែកសកម្មភាព មិនមែនជាទំព័រសម្រាប់សម្រេចចិត្តសំខាន់ទេ។',
  overviewSupportMetricsValueDetail: 'តម្លៃប៉ាន់ស្មាននៃឯកតាដែលមានក្នុងស្តុកឥឡូវនេះ។',
  overviewSupportMetricsSaleReadyDetail: 'SKU ដែលអាចលក់បាននៅហាងឥឡូវនេះ។',
  overviewSupportMetricsServicesDetail: 'បណ្ដុំសេវាកម្មដែលបានកំណត់ក្នុងកាតាឡុកឥឡូវនេះ។',
  overviewQueueSummaryReorderCandidates: 'ត្រូវគិតបញ្ជាទិញបន្ថែម',
  overviewQueueSummaryDueSoon: 'ដល់ក្នុង 48 ម៉ោង',
  overviewQueueReasonServiceImpact: 'ប៉ះពាល់ {count} {noun}',
  overviewUrgentBadge: 'បន្ទាន់',
  overviewDaysOfCoverSuffix: 'ថ្ងៃគ្រប់គ្រាន់',
  overviewTaskStateToOrder: 'បញ្ជាទិញឥឡូវនេះ',
  overviewTaskStateFollowUpToday: 'តាមដានការដឹកមកដល់ថ្ងៃនេះ',
  overviewTaskStateReadyToReceive: 'ត្រៀមទទួល',
  overviewTaskStateReceivedToday: 'បានទទួលថ្ងៃនេះ',
  overviewTimingLate: 'យឺតជាងការរំពឹង',
  overviewTimingTight: 'រយៈពេលមកដល់តឹង',
  overviewTimingWide: 'រយៈពេលមកដល់ទូលាយ',
  overviewTimingNormal: 'រយៈពេលមកដល់ធម្មតា',
  overviewTimingPending: 'ពេលវេលាមកដល់នៅមិនទាន់ច្បាស់',
  overviewReceiptAwaitingSupplierUpdate: 'កំពុងរង់ចាំព័ត៌មានថ្មីពីអ្នកផ្គត់ផ្គង់',
  overviewReceiptWindowPassed: 'រយៈពេលដែលរំពឹងទុកបានផុតហើយ ដោយគ្មានការបញ្ជាក់ការទទួលទំនិញ។',
  overviewReceiptWindowOpen: 'រយៈពេលទទួលទំនិញ កំពុងបើកឥឡូវនេះ។',
  overviewReceiptWindowRange: 'រយៈពេលមកដល់ {start}-{end}',
  overviewReceiptWindowPending: 'រយៈពេលមកដល់កំពុងរង់ចាំ',
  overviewEtaExpectedOn: 'រំពឹងនៅ {date}',
  overviewEtaExpectedWindow: 'រំពឹង {date} ± {days} ថ្ងៃ',
  overviewTaskActionUpdateEta: 'អាប់ដេត ETA',
  overviewTaskActionFollowUp: 'តាមដានបន្ត',
  overviewTaskActionReceive: 'ទទួលទំនិញ',
  overviewTaskActionReview: 'ពិនិត្យ',
  overviewTaskWhyDetailOrder: '{cover} cover · សញ្ញាបញ្ជាទិញបន្ថែម {probability}',
  overviewTaskWhyOrderedAlready: 'បានបញ្ជាទិញរួចហើយ',
  overviewTaskWhyReceiptLoop: 'បញ្ជី កំពុងរក្សាវានៅក្នុងជួរទទួលទំនិញសកម្ម។',
  overviewTaskWhyCheckSupplier: 'ត្រូវការព័ត៌មានថ្មីពីអ្នកផ្គត់ផ្គង់',
  overviewTaskWhyReceiptWindowPassed: 'រយៈពេលដែលរំពឹងបានផុត ដោយគ្មានការអាប់ដេតថ្មី។',
  overviewTaskWhyReceiptDue: 'រយៈពេលទទួលទំនិញបានបើកហើយ',
  overviewTaskWhyReceiptWindowOpen: 'រយៈពេលមកដល់បច្ចុប្បន្នបានបើកហើយ។',
  overviewTaskWhyReceiptLogged: 'បានកត់ត្រាការទទួលទំនិញថ្ងៃនេះ',
  overviewTaskServiceImpactMayRestore: 'អាចស្តារឡើងវិញបាន {services}',
  overviewTaskServiceImpactBlocks: 'រារាំង {services}',
  overviewTaskServiceImpactAffects: 'ប៉ះពាល់ {services}',
  overviewTaskEtaNotOrderedYet: 'មិនទាន់បានបញ្ជាទិញទេ',
  overviewTaskEtaReceivedToday: 'បានទទួលថ្ងៃនេះ',
  overviewTaskEtaReceivedLogged: 'បានកត់ត្រា {date}',
  overviewTaskEtaReceivedFallback: 'បានកត់ត្រាការទទួលទំនិញថ្ងៃនេះ។',
  overviewTaskConfidenceWatch: 'ស្ថានភាពតាមដាន',
  overviewTaskHeartbeatOnHand: 'ទំនងជាមានក្នុងស្តុក {low}-{high}',
  overviewTaskNextOrderWaiting: 'បញ្ជី នឹងរក្សាវានៅក្នុង Order now រហូតដល់អ្នកកត់ត្រាការបញ្ជាទិញ។',
  overviewTaskNextOrderReviewOn: 'បញ្ជី នឹងរំលឹកឲ្យពិនិត្យម្តងទៀតនៅ {date}។',
  overviewTaskNextOrderReviewSoon: 'បញ្ជី នឹងរំលឹកឲ្យពិនិត្យម្តងទៀតក្នុងពេលឆាប់ៗ។',
  overviewTaskNextOrderUrgent: 'ការងារនេះនៅតែបន្ទាន់ ខណៈសញ្ញាបញ្ជាទិញបន្ថែមនៅសកម្ម។',
  overviewTaskNextArrivalRemindOn: 'បញ្ជី នឹងរំលឹកអ្នកនៅ {date}។',
  overviewTaskNextArrivalWatch: 'បញ្ជី នឹងបន្តតាមដានរយៈពេលដឹកមកដល់បច្ចុប្បន្ន។',
  overviewTaskNextArrivalFollowUp: 'ការងារនេះនឹងផ្លាស់ទៅ Follow up today ប្រសិនបើមិនមានការកត់ត្រាការទទួលទំនិញ។',
  overviewStaleReminderStateLabel: 'ការរំលឹក',
  overviewStaleReminderSnoozeAction: 'រំលឹកម្ដងទៀតថ្ងៃស្អែក',
  overviewStaleReminderWhyNow: 'ការអាប់ដេតពិតថ្មីមួយ បានយឺតពេលហើយ',
  overviewStaleReminderWhyDetail: 'បញ្ជី មិនទាន់ឃើញការអាប់ដេតដែលបានកត់ត្រា ក្នុងរយៈពេល {days} ថ្ងៃទេ។',
  overviewStaleReminderEtaLabel: 'ការអាប់ដេតចុងក្រោយ {date}',
  overviewStaleReminderConfidence: 'ចង្វាក់អាប់ដេតចាស់',
  overviewStaleReminderHeartbeatUpdated: 'ការអាប់ដេតដែលបានកត់ត្រាចុងក្រោយ {date}',
  overviewStaleReminderHeartbeatAge: '{days} ថ្ងៃ ចាប់តាំងពីការត្រួតពិនិត្យពិតចុងក្រោយ',
  overviewStaleReminderNextSnooze:
    'បើថ្ងៃនេះនៅមុនពេក សូមពន្យារការរំលឹកនេះ ហើយបញ្ជី នឹងយកវាមកវិញថ្ងៃស្អែក។',
  overviewSignalPromo: 'លំនាំពេលផ្សព្វផ្សាយ អាចបានជួយបង្កើនតម្រូវការសម្រាប់ {name}។',
  dashboardBody:
    'Banji រក្សាការងារកាតាឡុក លំដាប់លក់ និងស្តុក នៅលើ Mac នេះ ដើម្បីឲ្យក្រុមអាចបន្តការងារបានដោយមិនចាំបាច់រង់ចាំ cloud។',
  dashboardHealthDescription:
    'បង្ហាញថា សែលក្នុងម៉ាស៊ីន និងកន្លែងផ្ទុកទិន្នន័យរួចរាល់សម្រាប់ការងារឬអត់។',
  dashboardRecentDescription:
    'ពិនិត្យអ្វីដែលក្រុម storefront ទំនងជានឹងលើកមុខមុន បន្ទាប់មកកែសម្រួលការរៀបចំលក់បើចាំបាច់។',
  dashboardQuickCreateDescription:
    'បន្ថែម SKU កំណត់សេវាកម្ម ឬចូលទៅកាន់ការអាប់ដេតស្តុកភ្លាមៗ។',
  dashboardRiskDescription:
    'មើលថា SKU មួយណាត្រូវយកចិត្តទុកដាក់ និងកន្លែងណាដែលសម្ពាធបញ្ជាទិញបន្ថែមកំពុងកើនឡើង។',
  catalogSkuEditorNameHelper: 'ដាក់ឈ្មោះ SKU តាមរបៀបដែលបុគ្គលិកនឹងស្វែងរកវា។',
  catalogSkuEditorDescriptionHelper:
    'ពិពណ៌នា SKU នេះ ដើម្បីឲ្យបុគ្គលិកអាចបែងចែកវាចេញពីធាតុស្រដៀងគ្នាបានរហ័ស។',
  catalogSkuEditorUnitsHelper: 'អាប់ដេតចំនួនស្តុកដែលបានរាប់ចុងក្រោយសម្រាប់ SKU នេះ។',
  catalogSkuEditorCostHelper: 'រក្សាតម្លៃថ្លៃដើមបច្ចុប្បន្ន ឬតម្លៃជំនួសក្នុងមួយឯកតានៅទីនេះ។',
  catalogSkuEditorLeadTimeMeanHelper:
    'ពេលវេលាមកដល់ជាទូទៅពីអ្នកផ្គត់ផ្គង់ ដែល Banji គួរប្រើ មុនពេលមានភស្តុតាងថ្មីជាងនេះ។',
  catalogSkuEditorLeadTimeStdHelper:
    'បង្ហាញថាពេលវេលាពីអ្នកផ្គត់ផ្គង់ ជាទូទៅប្រែប្រួលជុំវិញមធ្យមប៉ុន្មាន។',
  catalogSkuEditorSellableHelper:
    'បើកជម្រើសនេះ នៅពេល SKU នេះត្រូវបានលក់ផ្ទាល់ ហើយត្រូវការតម្លៃលក់។',
  catalogSkuEditorPriceHelper: 'តម្លៃលក់ នឹងបង្ហាញតែពេល SKU នេះត្រូវបានលក់ផ្ទាល់ប៉ុណ្ណោះ។',
  catalogSkuEditorDetailsDescriptor:
    'កំណត់ឈ្មោះ SKU និងការពិពណ៌នាខាងក្នុង ដែល Banji នឹងប្រើនៅទូទាំងកម្មវិធី។',
  catalogSkuEditorIdentifierHelper: 'បញ្ចូលលេខសម្គាល់ SKU ដែលមានស្ថិរភាព។ បន្ទាប់ពីរក្សាទុក អ្នកមិនអាចប្ដូរវាបានទេ។',
  catalogSkuEditorPricingDescriptor:
    'កំណត់ថ្លៃដើម និងការកំណត់លក់ផ្ទាល់ ដែល Banji គួរប្រើសម្រាប់ SKU នេះ។',
  catalogSkuEditorRetailPriceHelper: 'បញ្ចូលតម្លៃលក់រាយ តែបើអតិថិជនទិញ SKU នេះដោយផ្ទាល់។',
  catalogSkuEditorSellAsProductHelper: 'បើកជម្រើសនេះ នៅពេលអតិថិជនអាចទិញ SKU នេះដោយផ្ទាល់។',
  catalogSkuEditorPlanningDescriptor:
    'បន្ថែមព័ត៌មានអំពីពេលវេលាពីអ្នកផ្គត់ផ្គង់ តែបើវាជួយធ្វើឲ្យសេចក្តីសម្រេចបំពេញស្តុកបន្ទាប់ប្រសើរឡើង។',
  catalogSkuEditorLeadTimeVariabilityHelper:
    'ជ្រើសថាពេលវេលាពីអ្នកផ្គត់ផ្គង់ ជាទូទៅប្រែប្រួលជុំវិញមធ្យមប៉ុន្មាន។',
  catalogServiceEditorNameHelper: 'ដាក់ឈ្មោះសេវាកម្ម តាមរបៀបដែលបុគ្គលិកអាចស្គាល់វាបានភ្លាម។',
  catalogServiceEditorDescriptionHelper: 'ពិពណ៌នាថាសេវាកម្មនេះជាអ្វី ដើម្បីឲ្យកាតាឡុកមើលងាយស្រួល។',
  catalogServiceEditorPriceHelper: 'តម្លៃលក់ដែលបុគ្គលិក និងរបាយការណ៍គួរប្រើសម្រាប់សេវាកម្មនេះ។',
  catalogServiceEditorLinkedSkusDescriptor:
    'ភ្ជាប់ SKU ដែលសេវាកម្មនេះប្រើ ដើម្បីឲ្យ Banji អាចតាមដានការគ្របដណ្តប់ និងចំណុចរារាំងបាន។',
  catalogServiceEditorDetailsDescriptor:
    'កំណត់ឈ្មោះ និងការពិពណ៌នាសេវាកម្ម ដែល Banji នឹងបង្ហាញនៅទូទាំងកម្មវិធី។',
  catalogServiceEditorIdentifierHelper: 'ប្រើលេខសម្គាល់សេវាកម្មដែលមានស្ថិរភាព។ បន្ទាប់ពីរក្សាទុក អ្នកមិនអាចប្ដូរវាបានទេ។',
  catalogServiceEditorPricingDescriptor:
    'កំណត់តម្លៃដែលអតិថិជនឃើញ ដែល Banji គួរប្រើសម្រាប់សេវាកម្មនេះ។',
  catalogServiceEditorLinkedSkusHelper:
    'ជ្រើស SKU ទាំងអស់ ដែលជាទូទៅត្រូវបានប្រើ នៅពេលសេវាកម្មនេះត្រូវបានលក់។',
  analysisRouteDescriptor:
    'មើលថាការអាប់ដេតដែលបានរក្សាទុក បានក្លាយជាស្ថានភាពបច្ចុប្បន្នរបស់ Banji អំពីតម្រូវការ ស្តុកកំពុងមកដល់ ពេលវេលាមកដល់ និងតម្លៃ យ៉ាងដូចម្តេច។',
  analysisRouteNeedCatalogTitle: 'Analysis ត្រូវការកាតាឡុកជាមុន',
  analysisRouteNeedCatalogHint: 'បង្កើត SKU ដំបូងរបស់អ្នក ដើម្បីឲ្យ Banji មានធាតុពិតសម្រាប់វិភាគ។',
  analysisRouteNeedRunTitle: 'Analysis ត្រូវការការអាប់ដេតដំបូងរបស់អ្នក',
  analysisRouteNeedRunHint: 'រក្សាទុកការអាប់ដេតពិតមួយ ដើម្បីឲ្យ Banji អាចពន្យល់ថាស្ថានភាពបច្ចុប្បន្ន ត្រូវបានបង្កើតឡើងយ៉ាងដូចម្តេច។',
  catalogSenaSkuHeroTooltip:
    'នេះគឺជាការប៉ាន់ស្មានចុងក្រោយរបស់ Banji សម្រាប់ SKU នេះ។ វារួមបញ្ចូលស្តុកបច្ចុប្បន្ន ភាពមិនច្បាស់លាស់ ថ្ងៃគ្រប់គ្រាន់ សម្ពាធបញ្ជាទិញបន្ថែម និងស្តុកកំពុងមកដល់ នៅក្នុងទិដ្ឋភាពតែមួយ។',
  catalogSenaSkuRibbonTooltip:
    'ផ្ទាំងនេះរក្សាទុកសញ្ញាសំខាន់បំផុតអំពីស្តុក ស្តុកកំពុងមកដល់ តម្រូវការ តម្លៃ និងផលប៉ះពាល់លើសេវាកម្ម នៅកន្លែងតែមួយ។',
  catalogSenaSkuLedgerTooltip:
    'បន្ទាត់ពេលវេលានេះបង្ហាញអ្វីដែល Banji គិតថាបានកើតឡើងតាមពេលវេលា រួមមានលំនាំលក់ តម្រូវការ ការផ្លាស់ប្តូរស្តុក ការបញ្ជាទិញ ការទទួលទំនិញ និងការកែសម្រួល។',
  catalogSenaSkuDependencyImpactTooltip:
    'មើលថាសេវាកម្មមួយណាពឹងផ្អែកលើ SKU នេះ និងកន្លែងណាដែលការខ្វះស្តុកអាចរារាំងការងារ។',
  catalogSenaSkuEvidenceTimelineTooltip:
    'បន្ទាត់ពេលវេលានេះបង្ហាញការអាប់ដេតដែលបានរក្សាទុក ដែល Banji ប្រើដើម្បីបង្កើតការប៉ាន់ស្មានចុងក្រោយ។',
  catalogSenaSkuSelectedIntervalTooltip:
    'ចន្លោះពេលដែលបានជ្រើស បង្ហាញសង្ខេបនៃពេលវេលាដែលអ្នកកំពុងពិនិត្យឥឡូវនេះ។ វាធ្វើឲ្យផ្ទាំងខាងស្ដាំត្រូវគ្នានឹងចន្លោះពេលដូចគ្នាដែលបង្ហាញក្នុងបន្ទាត់ពេលវេលា។',
  catalogSenaSkuActNowTooltip: 'នេះគឺជាជំហានបន្ទាប់ដែល Banji ណែនាំសម្រាប់ SKU នេះ។',
  catalogSenaSkuOpenPipelineTooltip:
    'មើលថាស្តុកណាខ្លះនៅតែកំពុងមកដល់សម្រាប់ SKU នេះ និងពេលណាដែលវាទំនងជានឹងមកដល់បំផុត។',
  catalogSenaSkuRailExposureTooltip:
    'មើលកន្លែងណាដែល SKU នេះកំពុងធ្វើឲ្យសេវាកម្មយឺត ឬអាចក្លាយជាចំណុចរារាំងក្នុងពេលឆាប់ៗ។',
  catalogSenaSkuNextTouchTooltip: 'មើលថាពេលណាដែល Banji គិតថា SKU នេះត្រូវពិនិត្យម្ដងទៀត។',
  catalogSenaSkuNeedsObservations: 'Banji ត្រូវការការអាប់ដេតយ៉ាងតិចពីរ សម្រាប់ទិដ្ឋភាពលម្អិតនេះ',
  catalogSenaSkuDegraded:
    'ការវិភាគលម្អិតមិនអាចប្រើបានឥឡូវនេះទេ ប៉ុន្តែការគ្រប់គ្រង SKU សំខាន់ៗនៅតែដំណើរការ។',
  catalogSenaSkuDialogDescription: 'កត់ត្រាការអាប់ដេតជាក់លាក់សម្រាប់ SKU មួយ បន្ទាប់មកផ្ទុកទិដ្ឋភាពនេះឡើងវិញ។',
  catalogSenaSkuLeadTimeVariabilityHint:
    'ជ្រើសក្រុមពេលវេលាដែលត្រូវគ្នាបំផុតនឹងការអាប់ដេតពីអ្នកផ្គត់ផ្គង់នេះ។',
  catalogSenaSkuInventoryLaneTooltip:
    'មើលការប៉ាន់ស្មានស្តុកចុងក្រោយរបស់ Banji ជាមួយបន្ទាត់បញ្ជាទិញបន្ថែម និងការណែនាំស្តុកសុវត្ថិភាព។',
  catalogSenaSkuFlowLaneTooltip:
    'មើលថាអ្វីបានធ្វើឲ្យស្តុកផ្លាស់ប្តូរបំផុតក្នុងមួយរយៈពេល: តម្រូវការសេវាកម្ម តម្រូវការលក់រាយ ការទទួលទំនិញ និងការកែសម្រួល។',
  catalogSenaSkuPipelineLaneTooltip:
    'មើលថា Banji គិតថាអ្វីនៅតែកំពុងមកដល់ រួមមានសញ្ញាបញ្ជាទិញ ស្តុកកំពុងមកដល់ និងការទទួលទំនិញ។',
  catalogNoResultsDescription: 'សាកល្បងស្វែងរកម្ដងទៀត ឬបង្កើតធាតុថ្មីមួយដែលសមនឹងកន្លែងនេះ។',
  catalogSenaSkuApproximateReceiptQuantity: 'បរិមាណទទួលទំនិញប្រហាក់ប្រហែល',
  catalogSenaSkuSaving: 'កំពុងរក្សាទុក…',
  catalogSenaSkuEvidencePrevious: 'ទំព័រភស្តុតាងមុន',
  catalogSenaSkuEvidenceNext: 'ទំព័រភស្តុតាងបន្ទាប់',
  catalogSkuDetailNotFoundTitle: 'រកមិនឃើញ SKU',
  catalogSkuOverviewIdentityDescription: 'នេះគឺជាកំណត់ត្រាការងារសំខាន់សម្រាប់ SKU នេះ។',
  catalogSkuDirectSellStatus: 'ស្ថានភាពលក់ផ្ទាល់',
  catalogSkuOperationalStatusTitle: 'ស្ថានភាពប្រតិបត្តិការ',
  catalogSkuOperationalReorderSoon: 'ជិតដល់ពេលបញ្ជាទិញបន្ថែម',
  catalogSkuOperationalOverstocked: 'ស្តុកលើស',
  catalogServiceCommercialSetupTitle: 'ការរៀបចំផ្នែកអាជីវកម្ម',
  catalogServiceFulfillmentReady: 'អាចបំពេញបាន',
  catalogServiceConstraintHealthy: 'SKU ដែលភ្ជាប់ទាំងអស់ កំពុងស្ថិតក្នុងស្ថានភាពល្អ។',
  catalogServiceConstraintBlockedPrefix: 'ត្រូវបានរារាំងដោយ',
  catalogServiceViabilityTitle: 'ស្ថានភាពប្រតិបត្តិការ',
  catalogServiceOperationalConditionTitle: 'ស្ថានភាពប្រតិបត្តិការ',
  catalogServiceCurrentStatusTitle: 'ស្ថានភាពបច្ចុប្បន្ន',
  catalogServiceLimitingSkuHealthy: 'គ្មាន',
  catalogLinkedServicesLimiting: 'ធាតុដែលកំពុងរារាំង',
  catalogSkuPlanningActionTitle: 'សកម្មភាពដែលបានណែនាំ',
  catalogSkuPlanningActionSteady: 'មិនទាន់ត្រូវការសកម្មភាពភ្លាមៗទេ',
  catalogSkuPlanningMetricsTitle: 'សូចនាករជំនួយ',
  catalogSenaSkuRegimeLaneTooltip: 'ផ្លូវនេះបង្ហាញលំនាំតម្រូវការសំខាន់ នៅក្នុងចន្លោះពេលដែលកំពុងមើល។',
  catalogServiceRegimeLegendLabel: 'លំនាំ',
  catalogServiceDemandSellabilityLane: 'តម្រូវការ និងសមត្ថភាពដែលអាចផ្តល់បាន',
  catalogServiceDemandSellabilityLaneTooltip:
    'មើលគម្លាតរវាងតម្រូវការ និងអ្វីដែលអាចផ្តល់ជូនបានពិត នៅក្នុងមួយរយៈពេល។',
  catalogServiceSellableMinusDemand: 'អាចផ្តល់បាន ដកតម្រូវការ',
  catalogServiceContributorPressureLane: 'សម្ពាធពីអ្នកចូលរួម',
  catalogServicePressure: 'សម្ពាធ',
  catalogServiceDemandLabel: 'តម្រូវការ',
  catalogServiceGapLabel: 'គម្លាត',
  catalogServiceReceiptLogged: 'បានកត់ត្រាការទទួលទំនិញ',
  catalogServiceRestorationEmpty:
    'មិនទាន់ឃើញព្រឹត្តិការណ៍ស្តារឡើងវិញទេ។ កត់ត្រាការបញ្ជាទិញ ឬការទទួលទំនិញសម្រាប់ SKU ដែលភ្ជាប់ ដើម្បីអាប់ដេតផ្លូវស្តារឡើងវិញ។',
  catalogSkuDetailReports: 'របាយការណ៍ជំនួយ',
  catalogSkuDetailPosteriorUnits: 'ឯកតាប៉ាន់ស្មាន',
  catalogSkuDetailDemandPerDay: 'តម្រូវការរំពឹងក្នុងមួយថ្ងៃ',
  catalogSkuParametersDemandInterval: 'ចន្លោះតម្រូវការ',
  catalogSkuParametersConfidenceInterval: 'ចន្លោះទំនុកចិត្ត 95%',
  catalogSkuParametersCurrentThreshold: 'កម្រិតបញ្ជាទិញបច្ចុប្បន្ន',
  catalogSkuParametersObservedIntervals: 'ចន្លោះពេលដែលបានសង្កេត',
  catalogSkuParametersFittedRange: 'ជួរដែលត្រូវគ្នា',
  catalogSkuParametersExpectedDemand: 'តម្រូវការរំពឹងក្នុងមួយថ្ងៃ',
  catalogSkuParametersCriticalCoverRemaining: 'ថ្ងៃគ្រប់គ្រាន់សំខាន់ដែលនៅសល់',
  catalogSkuRecentReportsTitle: 'របាយការណ៍ថ្មីៗ',
  catalogSkuRecentReportsCostUpdated: 'បានអាប់ដេតថ្លៃដើម',
  catalogSkuRecentReportsRestockIncluded: 'មានការបំពេញស្តុកបន្ថែម',
  catalogSkuRecentReportsNoSkuChanges: 'មិនមានការផ្លាស់ប្តូរជាក់លាក់សម្រាប់ SKU ទេ',
  catalogSkuEditorTitleNew: 'SKU ថ្មី',
  catalogSkuEditorIdentifierDescription: 'លេខសម្គាល់ SKU នេះ នឹងត្រូវចាក់សោបន្ទាប់ពីបង្កើត។',
  catalogSkuEditorPricingTooltip:
    'ការកំណត់តម្លៃ កំណត់សេដ្ឋកិច្ចក្នុងមួយឯកតាសម្រាប់ SKU នេះ និងថាវាមានការលក់ផ្ទាល់ឬអត់។',
  catalogSkuEditorLeadTimeVariabilityHint: 'ជ្រើសកម្រិតដែលត្រូវគ្នាបំផុតនឹងពេលវេលាអ្នកផ្គត់ផ្គង់ថ្មីៗ។',
  catalogSkuLeadTimeVariabilityPlaceholder: 'ជ្រើសកម្រិតប្រែប្រួល',
  catalogServiceLinkedSkusTitle: 'ធាតុដែលពឹងផ្អែកគ្នា',
  catalogServiceLinkedSkuStatusLabel: 'ស្ថានភាព',
  catalogServiceLinkedSkuBottleneckBadge: 'ចំណុចរារាំង',
  catalogServiceAvailabilityTitle: 'ភាពមានស្រាប់',
  catalogServiceAvailabilityUnlinked: 'មិនបានភ្ជាប់',
  catalogServiceDependencyMapTitle: 'ផែនទីភាពពឹងផ្អែក',
  catalogServiceContributorsTitle: 'ធាតុដែលពឹងផ្អែកគ្នា',
  catalogServiceDependencyImpactTitle: 'ផលប៉ះពាល់ពី SKU ដែលភ្ជាប់',
  catalogServiceContributorBottleneckBadge: 'ចំណុចរារាំង',
  catalogServiceFragilityTitle: 'ភាពងាយរងផលប៉ះពាល់',
  catalogServiceFragilityCurrentState: 'ស្ថានភាពភាពមានស្រាប់បច្ចុប្បន្ន',
  catalogServiceFragilityNextLimiter: 'ចំណុចកំណត់បន្ទាប់ដែលទំនង',
  catalogServiceFragilityDisruptionWindow: 'រយៈពេលរាំងស្ទះដែលប៉ាន់ស្មាន',
  catalogServiceFragilityUnavailable: 'មិនអាចផ្តល់បាន',
  catalogServiceFailureModesTitle: 'របៀបបរាជ័យ',
  catalogServiceFailureModesEmpty: 'មិនមានរបៀបបរាជ័យទេ ប្រសិនបើមិនមាន SKU ដែលភ្ជាប់។',
  catalogServiceEconomicsTitle: 'បរិបទសេដ្ឋកិច្ច',
  catalogServiceEstimatedInputCost: 'ថ្លៃដើមប៉ាន់ស្មាន',
  catalogServiceEvidenceTimelineTitle: 'ការអាប់ដេតថ្មីៗ',
  catalogServiceHeroAvailabilityTitle: 'ភាពមានស្រាប់បច្ចុប្បន្ន',
  catalogServiceHeroRibbonTooltip: 'ទិដ្ឋភាពសង្ខេបនៃភាពមានស្រាប់ សម្ពាធតម្រូវការ ចំណុចរារាំង និងពេលវេលាស្តារឡើងវិញ។',
  catalogServiceRailActNowTitle: 'ជំហានបន្ទាប់',
  catalogServiceRailSelectedIntervalTitle: 'រយៈពេលដែលបានជ្រើស',
  catalogServiceRailBottleneckStackTitle: 'ចំណុចរារាំងសំខាន់',
  catalogServiceRailCoverLine: '{value} នៃថ្ងៃគ្រប់គ្រាន់',
  catalogServiceRailMetricDemand: 'តម្រូវការ',
  catalogServiceRailMetricSellable: 'អាចផ្តល់បាន',
  catalogServiceRailMetricGap: 'ខ្វះខាត',
  settingsBody:
    'កែប្រែរបៀបដំណើរការក្នុងម៉ាស៊ីន ជំនួយស្រេចចិត្ត និងចំណូលចិត្តសម្រាប់កន្លែងធ្វើការពីទំព័រតែមួយ។',
  settingsStorage:
    'ភាសា និងរូបិយប័ណ្ណត្រូវបានរក្សាទុកក្នុងផ្ទៃមុខក្នុងម៉ាស៊ីន ខណៈទិន្នន័យស្តុកនៅតែស្ថិតក្នុងថតទិន្នន័យរបស់កម្មវិធីលើ desktop។',
  settingsDisclaimer: 'ម៉ាស៊ីននេះនៅតែជាចំណុចសំខាន់សម្រាប់ prototype បច្ចុប្បន្ន។',
  settingsWorkspacePreferencesDescription:
    'ភាសា និងរូបិយប័ណ្ណបង្ហាញភ្លាមៗ ប៉ុន្តែត្រូវបានរក្សាទុកតែពេលអ្នករក្សាទុកចំណូលចិត្តប៉ុណ្ណោះ។',
  settingsAdvancedDescription:
    'លាក់ទុកការកំណត់លម្អិតឲ្យនៅក្រោយ លុះត្រាតែអ្នកកំពុងកែវាដោយចេតនា។',
  settingsDirtySummaryPreferences: 'ចំណូលចិត្តកន្លែងធ្វើការបានផ្លាស់ប្តូរ។',
  settingsDirtySummaryAdvanced: 'ការកំណត់លម្អិតសម្រាប់ផែនការបានផ្លាស់ប្តូរ។',
  settingsDirtySummaryBoth: 'ចំណូលចិត្តកន្លែងធ្វើការ និងការកំណត់លម្អិតសម្រាប់ផែនការបានផ្លាស់ប្តូរ។',
  settingsLocalDataDescription:
    'Banji រក្សាទុកទិន្នន័យការងារនៅលើឧបករណ៍នេះ។ បើកថត នៅពេលអ្នកត្រូវការឯកសារក្នុងម៉ាស៊ីន។',
  settingsLocalDataRawFormatNote:
    'ឯកសារដើមប្រើទម្រង់ JSON ខាងក្នុងរបស់ Banji។ ការនាំចេញ CSV សម្រាប់ពិនិត្យក្នុងសៀវភៅតារាង។',
  settingsTargetServiceLevelTooltip:
    'កម្រិតភាពមានស្រាប់ដែលគោលដៅ គឺជាគោលដៅស្តុកដែល Banji ប្រើសម្រាប់ផែនការ។ កម្រិតខ្ពស់ជាទូទៅមានន័យថាត្រូវកាន់ស្តុកច្រើនជាងមុន។',
  settingsForecastHorizonTooltip:
    'រយៈពេលព្យាករណ៍ បង្ហាញថា Banji មើលទៅមុខឆ្ងាយប៉ុន្មាន សម្រាប់តម្រូវការ និងហានិភ័យស្តុក។',
  settingsParticleCountTooltip:
    'តម្លៃខ្ពស់ជាទូទៅធ្វើឲ្យការប៉ាន់ស្មានរបស់ Banji ស្ថិរភាពជាងមុន ប៉ុន្តែការផ្ទុកឡើងវិញនឹងយូរជាងមុន។',
  settingsSmoothingWindowTooltip:
    'បង្អួចបន្ថយភាពរញ៉េរញ៉ៃ កំណត់ថារបាយការណ៍ថ្មីៗប៉ុន្មាន ដែល Banji ផ្តោតជាងគេ នៅពេលធ្វើឲ្យការសង្កេតដែលខ្វះៗមើលងាយស្រួល។',
  settingsDesktopPreferencesDescription:
    'ជ្រើសថា Banji គួរបង្ហាញការណែនាំស្រេចចិត្តប៉ុន្មាន និងឲ្យឧបករណ៍នេះដំណើរការយ៉ាងដូចម្តេច។',
  settingsPreferencesControlsDescription: 'ការកំណត់ទាំងនេះប៉ះពាល់តែឧបករណ៍នេះប៉ុណ្ណោះ។',
  settingsExchangeRateHelp: 'ប្រើសម្រាប់បង្ហាញចំនួន KHR ប៉ុណ្ណោះ។ តម្លៃដែលបានរក្សាទុកនៅតែជាដុល្លារ USD។',
  settingsInterfaceVisibilityDescription:
    'ប៊ូតុងបើកបិទទាំងនេះ គ្រប់គ្រងថា desktop បង្ហាញការណែនាំ និងព័ត៌មានជាប់ចំហៀងច្រើនប៉ុន្មាន។',
  settingsShowOptionalHelpHelp:
    'បង្ហាញ tooltip ការពិពណ៌នាផ្នែក និងជំនួយស្រេចចិត្ត។ ការណែនាំចាំបាច់នៅតែបង្ហាញជានិច្ច។',
  settingsShowFloatingActionsHelp:
    'រក្សាប៊ូតុងសកម្មភាពរបស់ទំព័រឲ្យនៅមើលឃើញ បន្ទាប់ពីចំណងជើងទំព័ររមូរចេញពីអេក្រង់។',
  settingsShowRightRailCardsHelp:
    'បង្ហាញផ្ទាំងព័ត៌មានខាងស្ដាំលើទំព័រវិភាគ សុខភាពអាជីវកម្ម និងទំព័រលម្អិត។',
  settingsSenaParametersPanelDescription:
    'កែថា Banji ប្រើព័ត៌មានលម្អិតប៉ុន្មាន នៅពេលប៉ាន់ស្មានស្តុក និងណែនាំបរិមាណបញ្ជាទិញបន្ថែម។',
  settingsAnalysisProfileTooltip:
    'វាជ្រើសកំណែម៉ាស៊ីនវិភាគក្នុងម៉ាស៊ីន។ ទុកវាដដែល លុះត្រាតែអ្នកកំពុងប្រៀបធៀបលទ្ធផលពីការរត់ផ្សេងៗ។',
  settingsAnalysisProfileHelp: 'កំណែវិភាគក្នុងម៉ាស៊ីន ដែល Banji នឹងប្រើនៅពេលផ្ទុកឡើងវិញបន្ទាប់។',
  settingsRecommendationQuantileHelp:
    'កំណត់ថា Banji គួរប្រុងប្រយ័ត្នប៉ុន្មាន នៅពេលគណនាបរិមាណណែនាំឱ្យបញ្ជាទិញ។',
  settingsRecommendationQuantileTooltip:
    'តម្លៃខ្ពស់ធ្វើឲ្យ Banji ណែនាំបរិមាណបញ្ជាទិញធំជាងមុន ដើម្បីការពារតម្រូវការច្រើនជាងមុន។',
  settingsRangeLowQuantileHelp: 'ចំណុចខាងក្រោមនៃជួរបរិមាណណែនាំឱ្យបញ្ជាទិញ។',
  settingsRangeLowQuantileTooltip: 'Banji ប្រើវាជាខាងក្រោមនៃជួរបរិមាណណែនាំឱ្យបញ្ជាទិញ។',
  settingsRangeHighQuantileHelp: 'ចំណុចខាងលើនៃជួរបរិមាណណែនាំឱ្យបញ្ជាទិញ។',
  settingsRangeHighQuantileTooltip: 'Banji ប្រើវាជាខាងលើនៃជួរបរិមាណណែនាំឱ្យបញ្ជាទិញ។',
  settingsNeedProbabilityGateHelp:
    'កំណត់ថា Banji ត្រូវប្រាកដប៉ុន្មាន មុនពេលណែនាំឲ្យបញ្ជាទិញបន្ថែមយ៉ាងច្បាស់។',
  settingsNeedProbabilityGateTooltip:
    'ក្រោមកម្រិតនេះ Banji អាចនៅតែបង្ហាញបរិមាណបញ្ជាទិញជាជម្រើស ប៉ុន្តែមិនសម្គាល់ថាជាការណែនាំរឹងមាំទេ។',
  settingsReviewDelayDaysHelp:
    'ចំនួនថ្ងៃបន្ថែមដែល Banji ការពារ មុនសេចក្តីសម្រេចបញ្ជាទិញបន្ថែមបន្ទាប់ទំនងកើតឡើង។',
  settingsReviewDelayDaysTooltip:
    'Banji បន្ថែមចំនួនថ្ងៃទាំងនេះលើពេលវេលាមកដល់ នៅពេលគណនាបរិមាណណែនាំឱ្យបញ្ជាទិញ។',
  settingsEnableSmoothingHelp: 'ធ្វើឲ្យខ្សែបន្ទាត់រលោង មុនពេល Banji សង្ខេបលទ្ធផល។',
  settingsEnableSmoothingTooltip:
    'វាអាចធ្វើឲ្យប្រវត្តិដែលខ្វះៗមើលងាយស្រួល ប៉ុន្តែក៏អាចលាក់ការផ្លាស់ប្តូរខ្លាំងៗបានដែរ។',
  settingsSenaParametersFixErrors: 'កែការកំណត់ផែនការដែលបានបន្លិច មុនពេលរក្សាទុក។',
  settingsSenaParametersRerunHint:
    'ពេលរក្សាទុកចំណូលចិត្ត Banji នឹងរត់ការវិភាគផែនការក្នុងម៉ាស៊ីនម្ដងទៀត ជាមួយការកំណត់ទាំងនេះ។',
  settingsLocalWorkspaceStorageDescription:
    'Banji រក្សាទុកទិន្នន័យកន្លែងធ្វើការនៅលើឧបករណ៍នេះ ក្នុងឯកសារ SQLite ក្នុងម៉ាស៊ីន។',
  settingsCreditsDescription: 'សារខ្លីពីអ្នកបង្កើត។',
  settingsParameterRunStatusExported: 'បាននាំចេញទិន្នន័យផែនការជា {format}។',
  settingsParameterRunStatusFailed: 'មិនអាចនាំចេញទិន្នន័យផែនការបានទេ។',
  settingsParameterRangeMessage: 'ជួរត្រឹមត្រូវ: {min} ដល់ {max}។',
  settingsParameterEnterValue: 'សូមបញ្ចូលតម្លៃមួយ។ {range}',
  settingsParameterEnterNumber: 'សូមបញ្ចូលលេខមួយ។ {range}',
  settingsRangeLowAboveHigh: 'ចំណុចចាប់ផ្តើមនៃជួរណែនាំ មិនអាចខ្ពស់ជាងចំណុចបញ្ចប់បានទេ។',
  settingsRangeHighBelowLow: 'ចំណុចបញ្ចប់នៃជួរណែនាំ ត្រូវខ្ពស់យ៉ាងហោចណាស់ស្មើចំណុចចាប់ផ្តើម។',
  settingsRecommendationOutsideRange:
    'កម្រិតបរិមាណណែនាំ ត្រូវស្ថិតនៅចន្លោះចំណុចចាប់ផ្តើម និងចំណុចបញ្ចប់នៃជួរ។',
  settingsLocalWorkspaceInfoFailed: 'មិនអាចផ្ទុកព័ត៌មានកន្លែងធ្វើការក្នុងម៉ាស៊ីនបានទេ។',
  settingsPreferencesFixErrors: 'កែការកំណត់ដែលបានបន្លិច មុនពេលរក្សាទុក។',
  settingsSenaRerunSaved: 'Banji បានផ្ទុកផែនការឡើងវិញ ជាមួយការកំណត់ដែលអ្នកបានរក្សាទុក។',
  settingsSenaRerunDefaults: 'Banji បានផ្ទុកផែនការឡើងវិញ ជាមួយការកំណត់លំនាំដើម។',
  settingsSenaRerunFailed: 'Banji មិនអាចផ្ទុកផែនការឡើងវិញឥឡូវនេះបានទេ។',
  settingsLogsExported: 'បាននាំចេញកំណត់ហេតុសកម្មភាពជា {format}។',
  settingsLogsExportFailed: 'មិនអាចនាំចេញកំណត់ហេតុសកម្មភាពបានទេ។',
  settingsSenaDataWorkbookTitle: 'ទិន្នន័យផែនការ Banji',
  settingsSenaDataExportFormatLabel: 'ជ្រើសទម្រង់ទិន្នន័យផែនការ',
  analysisWorkbenchLedgerDescriptor:
    'ពិនិត្យមើលថាការអាប់ដេតដែលបានរក្សាទុក បានក្លាយជាការវាយតម្លៃបច្ចុប្បន្នរបស់ Banji យ៉ាងដូចម្តេច។',
  analysisWorkbenchLaneRegimeSubtitle:
    'មើលលំនាំលក់សំខាន់ ជាមួយសញ្ញាតម្លៃ និងស្តុកអស់ ដែលបង្ហាញជាសញ្ញាស្រាលៗ មិនមែនជាកាតធ្ងន់ៗ។',
  analysisWorkbenchLaneInventorySubtitle:
    'ការប៉ាន់ស្មានស្តុកត្រូវបានបង្ហាញបន្តគ្នា ខណៈតម្រូវការសេវាកម្ម តម្រូវការលក់រាយ ការទទួលទំនិញ និងការកែសម្រួល នៅតែភ្ជាប់នឹងចន្លោះពេលនីមួយៗ។',
  analysisWorkbenchLanePipelineSubtitle:
    'ផ្លូវនេះបង្ហាញអ្វីដែល Banji គិតថានៅតែកំពុងមកដល់ ដោយបង្ហាញសញ្ញាបញ្ជាទិញ និងការដឹកមកដល់ដោយផ្ទាល់។',
  analysisWorkbenchLaneLeadTimeSubtitle:
    'ពេលវេលាមកដល់ត្រូវបានបង្ហាញជានិន្នាការ ជាមួយចន្លោះដែលទំនង ខណៈប្រភេទពេលវេលាត្រូវបានបង្ហាញនៅពេលជ្រើស មិនមែនបោះពុម្ពគ្រប់កន្លែងទេ។',
  analysisWorkbenchPressureDescriptor:
    'ប្រៀបធៀបថាហានិភ័យកើតចេញពីតម្រូវការ ស្តុកកំពុងមកដល់ ពេលវេលាមកដល់ ឬតម្លៃ។',
  analysisWorkbenchObservationsDescriptor:
    'ពិនិត្យថាសញ្ញាអ្វីខ្លះមាននៅក្នុងកំណត់ត្រានីមួយៗដែលបានរក្សាទុក។',
  analysisWorkbenchFragilityDescriptor:
    'មើលថា SKU ដែលភ្ជាប់មួយណា ទំនងជានឹងរារាំងសេវាកម្មនីមួយៗបំផុត។',
  analysisWorkbenchIntervalExplanationTooltip:
    'សេចក្តីសង្ខេបរបស់ Banji សម្រាប់ចន្លោះពេលដែលបានជ្រើស។',
  analysisWorkbenchWhatHappenedTooltip:
    'តម្រូវការ និងការផ្លាស់ប្តូរស្តុកសំខាន់ៗក្នុងចន្លោះពេលនេះ។',
  analysisWorkbenchOrdersTransitLeadTimeTooltip:
    'ស្ថានភាពការបញ្ជាទិញ ស្តុកកំពុងមកដល់ និងពេលវេលាមកដល់ ក្នុងចន្លោះពេលនេះ។',
  analysisWorkbenchSelectedEntityTooltip: 'ធាតុដែលបានជ្រើសនៅពេលនេះ ក្នុងទិដ្ឋភាពវិភាគ។',
  analysisWorkbenchPosteriorStateTooltip:
    'ការប៉ាន់ស្មានបច្ចុប្បន្នសម្រាប់តម្រូវការ ស្តុក ស្ថានភាពបញ្ជាទិញបន្ថែម និងស្តុកកំពុងមកដល់។',
  analysisWorkbenchReorderPolicyTooltip:
    'បង្ហាញការណែនាំបញ្ជាទិញបច្ចុប្បន្ន បន្ទាប់ពីគិតស្តុក ស្តុកកំពុងមកដល់ តម្រូវការ និងពេលវេលាមកដល់។',
  analysisWorkbenchContributorStackTooltip:
    'មូលហេតុដែលភ្ជាប់គ្នា និងមានឥទ្ធិពលខ្លាំងបំផុត នៅពីក្រោយធាតុនេះ។',
  analysisWorkbenchOverviewTooltip:
    'សេចក្តីសង្ខេបស្ថានភាពប្រព័ន្ធបច្ចុប្បន្ន នៅពេលមិនមានធាតុណាមួយត្រូវបានជ្រើស។',
  analysisWorkbenchStrongestChannelsTooltip:
    'ប្រភេទភស្តុតាងដែលមានឥទ្ធិពលខ្លាំងបំផុត ទៅលើការវាយតម្លៃប្រព័ន្ធបច្ចុប្បន្ន។',
  analysisWorkbenchSettingsDescriptor:
    'ពិនិត្យព័ត៌មានអំពីការរត់ និងកម្រិតភស្តុតាង នៅពីក្រោយការវិភាគនេះ។',
  stockUpdateBody:
    'កត់ត្រាការអាប់ដេតស្តុក ការផ្លាស់ប្តូរសេវាកម្មស្រេចចិត្ត និងសញ្ញាលំដាប់លក់ នៅក្នុងកំណត់ហេតុតែមួយ។',
  stockUpdateStepContextDescription:
    'បញ្ជាក់ពេលវេលាអាប់ដេត បន្ថែមកំណត់ចំណាំស្រេចចិត្ត និងជ្រើសលំនាំលក់ស្រេចចិត្ត។',
  stockUpdateStepStockDescription:
    'រាប់តែ SKU ដែលអ្នកបានពិនិត្យ។ បន្ថែមសញ្ញាជួរ សម្រាប់ការបញ្ជាទិញ ការដឹកមកដល់ ឬព្រឹត្តិការណ៍ស្តុក។',
  stockUpdateStepServiceDescription:
    'បន្ថែមការអាប់ដេតសេវាកម្ម តែពេលតម្លៃ ឬភាពមានស្រាប់បានផ្លាស់ប្តូរក្នុងរយៈពេលនេះប៉ុណ្ណោះ។',
  stockUpdateStepRankingsDescription: 'ស្រេចចិត្ត។ អូសតែពេលលំដាប់លក់ពិតបានផ្លាស់ប្តូរ។',
  stockUpdateStepReviewDescription: 'ពិនិត្យការអាប់ដេតនេះ មុនពេលរក្សាទុក។',
  stockUpdateStockViewTooltip:
    'Priority បង្ហាញ SKU ដែលបានណែនាំ Counted បង្ហាញជួរដែលបានផ្លាស់ប្តូរ ឬមានសញ្ញា ហើយ All SKUs បង្ហាញកាតាឡុកទាំងមូល។',
  stockUpdateStockStepTooltip: 'រក្សាទុកតែជួរស្តុកដែលបានផ្លាស់ប្តូរ និងសញ្ញាជួរដែលកំពុងសកម្មប៉ុណ្ណោះ។',
  stockUpdateSkuFlagsTooltip:
    'បន្ថែមព្រឹត្តិការណ៍ក្នុងរយៈពេលនេះសម្រាប់ SKU នេះ ដូចជាការបញ្ជាទិញ ការដឹកមកដល់ ឬស្ថានភាពត្រូវរារាំង។',
  stockUpdateServiceStepTooltip:
    'ការអាប់ដេតសេវាកម្មអនុវត្តលើជួរសេវាកម្ម មិនមែនលើការរាប់ស្តុក SKU នីមួយៗទេ។',
  stockUpdateServiceFlagsTooltip:
    'បន្ថែមការផ្លាស់ប្តូរតម្លៃ ឬការរារាំងកម្រិតសេវាកម្ម ដែលប៉ះពាល់ដល់ភាពមានស្រាប់។',
  stockUpdateRegimeHelp: 'លំនាំលក់នេះ អនុវត្តលើការអាប់ដេតទាំងមូល មិនមែនលើ SKU តែមួយទេ។',
  stockUpdateRegimeDescriptionEmpty:
    'ទុកឲ្យទទេ ប្រសិនបើរយៈពេលនេះមិនត្រូវការការពន្យល់មូលហេតុលក់សំខាន់តែមួយទេ។',
  stockUpdateReviewTooltip:
    'Banji រក្សាទុកតែជួរដែលបានផ្លាស់ប្តូរ និងសញ្ញាដែលកំពុងសកម្ម បន្ទាប់មកផ្ទុកទិដ្ឋភាពផែនការឡើងវិញ។',
  stockUpdateReviewBody:
    'Banji នឹងផ្ទុកស្តុក និងភាពអាចលក់បានឡើងវិញ អាប់ដេតការងារ Overview ផ្ទុកសកម្មភាពសុខភាពអាជីវកម្មឡើងវិញ និងបន្ថែមភស្តុតាងនេះទៅ Analysis។',
  stockUpdateOrderSignalSaved:
    'បរិមាណបញ្ជាទិញ និងទទួលទំនិញ នឹងត្រូវបានរក្សាទុកជាសញ្ញាការបញ្ជាទិញសម្រាប់រយៈពេលនេះ។',
  stockUpdateServicePriceSaved:
    'តម្លៃសេវាកម្ម ត្រូវបានរក្សាទុកតែសម្រាប់ជួរដែលតម្លៃថ្មីខុសពីតម្លៃចុងក្រោយក្នុងកាតាឡុក។',
  stockUpdateGuidanceChooseObservedAt: 'ជ្រើសពេលវេលាដែលបានសង្កេតត្រឹមត្រូវ មុនពេលបន្ត។',
  stockUpdateGuidanceCountOneSku:
    'រាប់ SKU យ៉ាងហោចណាស់មួយ មុនពេលបន្ត ដើម្បីឲ្យ Banji ចាប់យកការអាប់ដេតដំបូងបាន។',
  stockUpdateGuidanceFillSkuFlags:
    'បំពេញតម្លៃសញ្ញា SKU ទាំងអស់ដែលបានបើក ឬដកសញ្ញាទទេ មុនពេលបន្ត។',
  stockUpdateGuidanceFillServiceFlags:
    'បំពេញតម្លៃសញ្ញាសេវាកម្មទាំងអស់ដែលបានបើក ឬដកសញ្ញាទទេ មុនពេលបន្ត។',
  stockUpdateGuidanceFillSkuFlagsSave:
    'បំពេញតម្លៃសញ្ញា SKU ទាំងអស់ដែលបានបើក ឬដកសញ្ញាទទេ មុនពេលរក្សាទុក។',
  stockUpdateGuidanceFillServiceFlagsSave:
    'បំពេញតម្លៃសញ្ញាសេវាកម្មទាំងអស់ដែលបានបើក ឬដកសញ្ញាទទេ មុនពេលរក្សាទុក។',
  stockUpdateGuidanceAddSignal:
    'បន្ថែមការរាប់ស្តុក សញ្ញាជួរ លំនាំលក់ ឬសញ្ញាលំដាប់លក់យ៉ាងហោចណាស់មួយ មុនពេលរក្សាទុក។',
  stockUpdateGuidanceFirstUpdateNeedsCount:
    'ការអាប់ដេតលើកដំបូង ត្រូវមាន SKU ដែលបានរាប់យ៉ាងហោចណាស់មួយ ដើម្បីឲ្យ Banji ចាប់យកស្តុកបាន។',
  stockUpdateDescriptorWithHistory: 'គ្របដណ្តប់ការផ្លាស់ប្តូរចាប់តាំងពី {date}{suffix}។',
  stockUpdateDescriptorFirst:
    'ចាប់ផ្តើម Banji ដោយរាប់ SKU មួយជាមុនសិន បន្ទាប់មកការអាប់ដេតក្រោយៗអាចសាមញ្ញជាងនេះបាន។',
  stockUpdateContextFooterEmpty:
    'ទុកលំនាំលក់ឲ្យទទេ ប្រសិនបើរយៈពេលនេះមិនត្រូវការការពន្យល់សំខាន់តែមួយទេ។',
  stockUpdateContextTooltip:
    'កំណត់ពេលវេលាអាប់ដេត បន្ថែមកំណត់ចំណាំស្រេចចិត្ត និងជ្រើសលំនាំលក់ស្រេចចិត្ត សម្រាប់ការអាប់ដេតទាំងមូល។',
  stockUpdateObservedAtTooltip:
    'ពេលវេលានេះជាគោលសម្រាប់រយៈពេលចាប់តាំងពីការអាប់ដេតដែលបានបញ្ជាក់ចុងក្រោយ។',
  stockUpdateObservedAtHelp:
    'Banji ចាប់ផ្តើមពីពេលអាប់ដេតចុងក្រោយដែលបានរក្សាទុក ដូច្នេះកែតែពេលបញ្ចប់នៅទីនេះប៉ុណ្ណោះ។',
  stockUpdateNotesTooltip:
    'ប្រើកំណត់ចំណាំសម្រាប់បរិបទមនុស្ស។ បន្ថែមសញ្ញាមានរចនាសម្ព័ន្ធ នៅពេល Banji គួររៀនពីការផ្លាស់ប្តូរនេះ។',
  stockUpdateNotesHelp:
    'កំណត់ចំណាំជួយពន្យល់ការអាប់ដេត ប៉ុន្តែវាមិនរាប់ជាសញ្ញាអាជីវកម្មដោយខ្លួនឯងទេ។',
  stockUpdateRankingsTooltip:
    'លំដាប់ទាំងនេះជាភស្តុតាងនៃលំដាប់លក់។ ទុកវាដដែល ប្រសិនបើលំដាប់លក់មិនបានផ្លាស់ប្តូរយ៉ាងមានន័យទេ។',
  stockUpdateSaveObservedAtError: 'ជ្រើសពេលវេលាដែលបានសង្កេតត្រឹមត្រូវ មុនពេលរក្សាទុក។',
  stockUpdateSaveFailed: 'Banji មិនអាចរក្សាទុកការអាប់ដេតនេះឥឡូវនេះបានទេ។ សូមសាកម្តងទៀត។',
  stockTableTitle: 'ការសង្កេត SKU',
  stockHistorySourceManual: 'ការអាប់ដេតដោយដៃ',
  stockHistorySourceCompat: 'ការអាប់ដេតដែលបាននាំចូល',
  stockHistorySourceLegacy: 'ការនាំចូលចាប់ផ្តើម',
  stockHistoryChangedRowSingular: 'ជួរដែលបានផ្លាស់ប្តូរ',
  stockHistoryChangedRowPlural: 'ជួរដែលបានផ្លាស់ប្តូរ',
  stockHistoryNoNotes: 'មិនមានកំណត់ចំណាំរបាយការណ៍សម្រាប់ការអាប់ដេតនេះទេ។',
  stockHistoryNoRanking: 'មិនមានការកត់ត្រាលំដាប់លក់សម្រាប់ការអាប់ដេតនេះទេ។',
  stockHistoryNoObservations: 'មិនមានការសង្កេត SKU សម្រាប់ការអាប់ដេតនេះទេ។',
  stockComposerCancel: 'បោះបង់វគ្គ',
  stockSessionProgress: 'ផ្នែកដែលរួចរាល់',
  stockSessionIncomplete: 'វគ្គមិនទាន់រួច',
  stockSessionReady: 'រួចរាល់សម្រាប់ដាក់ស្នើ',
  stockSessionStepLabel: 'ជំហាន',
  stockSessionStepDetailsDescription:
    'កំណត់ពេលដែលបានសង្កេតការអាប់ដេត និងបន្ថែមកំណត់ចំណាំ ប្រសិនបើវាជួយពេលក្រោយ។',
  stockSessionStepObservations: 'ការសង្កេត SKU',
  stockSessionStepObservationsDescription:
    'កត់ត្រាជួរ SKU ដែលបានផ្លាស់ប្តូរយ៉ាងហោចណាស់មួយ។ នេះជាផ្នែកដែលត្រូវការចាំបាច់នៃវគ្គ។',
  stockSessionStepRequired: 'បំពេញផ្នែកដែលត្រូវការ មុនពេលដាក់ស្នើការអាប់ដេតនេះ។',
  stockSessionBack: 'ត្រឡប់ក្រោយ',
  stockSessionNext: 'បន្ទាប់',
  stockSessionSubmit: 'ដាក់ស្នើការអាប់ដេត',
  stockStepStatusRequired: 'ត្រូវការ',
  stockStepStatusComplete: 'រួចរាល់',
  stockStepStatusSkipped: 'បានរំលង',
  stockSalesSignalPanelTitle: 'លំដាប់លក់ថ្មីៗ',
  stockSalesSignalUnsavedBadge: 'មានការផ្លាស់ប្តូរមិនទាន់រក្សាទុក',
  stockSalesSignalEntrySingular: 'ធាតុក្នុងវិសាលភាព',
  stockSalesSignalEntryPlural: 'ធាតុក្នុងវិសាលភាព',
  stockSalesSignalResetAction: 'កំណត់លំដាប់ឡើងវិញ',
  stockSalesSignalHelperNote: 'អាប់ដេតវាតែពេលលំដាប់លក់ថ្មីៗ ផ្លាស់ប្តូរយ៉ាងមានន័យប៉ុណ្ណោះ។',
  stockSalesSignalEmptyTitle: 'មិនមានលំដាប់លក់ថ្មីៗសម្រាប់កត់ត្រាទេ',
  stockServiceDoneAction: 'បញ្ចប់ការពិនិត្យ',
  stockServiceFilterChanged: 'ជួរដែលបានផ្លាស់ប្តូរ',
  stockObservationsChangedSummaryReady: 'ជួរដែលបានផ្លាស់ប្តូរ រួចរាល់សម្រាប់ពិនិត្យ និងដាក់ស្នើ។',
  stockObservationsFilterAll: 'ជួរទាំងអស់',
  stockObservationsFilterChanged: 'ជួរដែលបានផ្លាស់ប្តូរ',
  stockObservationsSearchLabel: 'ស្វែងរកជួរ SKU',
  stockObservationsSearchPlaceholder: 'ស្វែងរកឈ្មោះ ឬលេខសម្គាល់ SKU…',
  stockObservationsSearchResultSingular: 'ជួរដែលត្រូវគ្នា',
  stockObservationsSearchResultPlural: 'ជួរដែលត្រូវគ្នា',
  stockObservationsSearchEmpty: 'មិនមានជួរ SKU ណាត្រូវនឹងការស្វែងរកបច្ចុប្បន្នទេ។',
  stockObservationsChangedBadge: 'បានផ្លាស់ប្តូរ',
  stockFocusedBadge: 'កំពុងផ្តោត',
  stockFocusSkuHint: 'បានបើកពី SKU នេះ',
  stockSummaryTitle: 'សំណុំការផ្លាស់ប្តូរដែលកំពុងរង់ចាំ',
  stockReviewNoNotes: 'មិនមានកំណត់ចំណាំនឹងត្រូវបញ្ចូលជាមួយការអាប់ដេតនេះទេ។',
  stockReviewSalesSignalChanged: 'បានផ្លាស់ប្តូរក្នុងវគ្គនេះ',
  stockReviewSalesSignalUnchanged: 'មិនមានការផ្លាស់ប្តូរត្រូវបានកត់ត្រាទេ',
  stockUpdatesReady: 'ជួរដែលរួចរាល់សម្រាប់រាយការណ៍',
  stockEditAction: 'ត្រឡប់ទៅកាន់ការកែ',
  stockPresetSmall: 'លម្អិត',
  stockPresetMedium: 'ស្តង់ដារ',
  stockPresetBig: 'ច្រើន',
  stockIncrementSize: 'ទំហំបន្ថែម',
  stockDone: 'រក្សាទុកការអាប់ដេត',
  stockPhaseEditing: 'កំពុងកែ',
  stockPhaseReview: 'ពិនិត្យ',
  stockReportedAt: 'បានរាយការណ៍នៅ',
  stockReportNotes: 'កំណត់ចំណាំរបាយការណ៍',
  stockObservationRowNotesLabel: 'កំណត់ចំណាំ SKU',
  stockObservationRowNotesPlaceholder: 'កត់ត្រាករណីលើកលែង ឬបរិបទសម្រាប់ជួរនេះ។',
  stockObservationResetRow: 'កំណត់ជួរ SKU ឡើងវិញ',
  stockRestockIncluded: 'មានការបំពេញស្តុកបន្ថែម',
  stockObservationsClearAction: 'សម្អាតការផ្លាស់ប្តូរ SKU',
  stockUnitsUp: 'ឯកតាកើនឡើង',
  stockUnitsDown: 'ឯកតាធ្លាក់ចុះ',
  stockTopRetailRanking: 'SKU លក់រាយកំពូលដែលបានសង្កេត',
  stockRankingHint: 'បញ្ចូលលេខសម្គាល់តាមលំដាប់លក់ដែលបានសង្កេត ដោយបំបែកដោយសញ្ញាក្បៀស។',
  stockSessionDraftResumed: 'បានបន្តសេចក្តីព្រាង',
  stockSessionDraftWillSaveOnExit: 'សេចក្តីព្រាងនឹងរក្សាទុកពេលចាកចេញ',
  stockSessionDraftAvailable: 'មានសេចក្តីព្រាង',
  stockSessionNoChangesToDiscard: 'មិនមានការផ្លាស់ប្តូរដែលត្រូវបោះបង់ទេ',
  stockUpdateRankingOptional: 'ស្រេចចិត្ត។ បន្ថែមតែពេលលំដាប់លក់ពិតបានផ្លាស់ប្តូរ។',
  stockUpdateClearRanking: 'សម្អាតលំដាប់',
  stockUpdateStockViewLabel: 'ទិដ្ឋភាព',
  stockUpdateCostIfChanged: 'ថ្លៃដើម ប្រសិនបើបានផ្លាស់ប្តូរ',
  stockUpdateLatestUnits: 'ចុងក្រោយ {count} ឯកតា',
  stockUpdateCountedOn: 'បានរាប់នៅ {date}',
  stockUpdateNeverCounted: 'មិនទាន់បានអាប់ដេត',
  stockUpdateOrderFlag: 'ការបញ្ជាទិញ',
  stockUpdateReceiptFlag: 'ការដឹកមកដល់',
  stockUpdateRegimeSpikeDetail: 'តម្រូវការបានកើនឡើងខ្លាំងជាងរយៈពេលធម្មតា។',
  stockUpdateRegimeLullDetail: 'តម្រូវការបានទន់ចុះយ៉ាងច្បាស់ក្នុងរយៈពេលនេះ។',
  stockUpdateRegimeStockoutDetail: 'ចលនាដែលបានសង្កេត ត្រូវបានកំណត់ដោយភាពមានស្រាប់ដែលមានកម្រិត។',
  stockUpdateRegimePromoDetail: 'ការផ្សព្វផ្សាយ ឬយុទ្ធនាការ បានកំណត់លំនាំរយៈពេលនេះ។',
  stockUpdateRegimeCorrectionDetail: 'សកម្មភាពកែតម្រូវ ឬសម្អាតទិន្នន័យ បានប៉ះពាល់រយៈពេលនេះ។',
  stockUpdateSummaryIntervalDays: '{days} ថ្ងៃ',
  stockUpdateTopRetailItemsLabel: 'ធាតុលក់រាយកំពូលក្នុងរយៈពេលនេះ',
  stockUpdateRemoveOrderFlagFor: 'ដកសញ្ញាបញ្ជាទិញសម្រាប់ {name}',
  stockUpdateOrderedQuantityAria: 'បរិមាណបញ្ជាទិញសម្រាប់ {name}',
  stockUpdateRemoveReceiptFlagFor: 'ដកសញ្ញាទទួលទំនិញសម្រាប់ {name}',
  stockUpdateReceiptQuantityAria: 'បរិមាណទទួលទំនិញសម្រាប់ {name}',
  stockUpdateRemoveEventFlagFor: 'ដកសញ្ញាព្រឹត្តិការណ៍សម្រាប់ {name}',
  productRankingTitle: 'លំដាប់លក់ថ្មីៗ',
  serviceEditorLimitingSkuNone: 'គ្មាន',
  editorUnsavedChanges: 'មានការផ្លាស់ប្ដូរមិនទាន់រក្សាទុក',
  regimePromo: 'ផ្សព្វផ្សាយ',
  regimeNormal: 'ធម្មតា',
  regimeSpike: 'កើនខ្លាំង',
  regimeLull: 'ធ្លាក់ចុះ',
  regimeCorrection: 'កែសម្រួល',
  shellViewModeMaximal: 'ទិដ្ឋភាពពេញ',
  shellViewModeMinimal: 'ទិដ្ឋភាពតូច',
  scrollIntervalsLeft: 'រំកិលចន្លោះទៅឆ្វេង',
  scrollIntervalsRight: 'រំកិលចន្លោះទៅស្ដាំ',
  intervalLabel: 'ចន្លោះ {index}',
  skuEditorUnsavedLeavePrompt:
    'អ្នកមានការផ្លាស់ប្តូរ SKU មិនទាន់រក្សាទុក។ ចាកចេញពីទំព័រនេះ ហើយបោះបង់សេចក្តីព្រាងបច្ចុប្បន្នឬ?',
  sheetUnsavedLeavePrompt:
    'អ្នកមានការផ្លាស់ប្តូរសកម្មភាពមិនទាន់រក្សាទុក។ បិទផ្ទាំងនេះ ហើយបោះបង់សេចក្តីព្រាងបច្ចុប្បន្នឬ?',
  taskDrawerUnsavedLeavePrompt:
    'អ្នកមានការផ្លាស់ប្តូរការងារមិនទាន់រក្សាទុក។ បិទ drawer នេះ ហើយបោះបង់សេចក្តីព្រាងបច្ចុប្បន្នឬ?',
  operationsResumeObservations: 'បន្តការសង្កេត SKU',
  overviewTaskHeartbeatCover: 'ថ្ងៃគ្រប់គ្រាន់ {cover}',
  skuVmReceiptWindowDays: '{low}-{high} ថ្ងៃ',
  skuVmReceiptWindowMidpoint: 'ចំណុចកណ្ដាល {midpoint} ថ្ងៃ +/- {spread} ថ្ងៃ',
  skuVmVariability: 'ភាពប្រែប្រួល {label}',
  skuVmSelectedReceiptsAdjustments: 'ការដឹកមកដល់ {receipts} · ការកែសម្រួល {adjustments}។',
  skuVmSelectedNoReceiptsAdjustments: 'មិនមានការដឹកមកដល់ ឬការកែសម្រួលក្នុងចន្លោះពេលនេះទេ។',
  skuVmEvidenceLeadTimeTypical: 'ជាទូទៅ {days} ថ្ងៃ',
  skuVmEvidenceLeadTimeRange: 'ជួរ {low}-{high} ថ្ងៃ',
  skuVmActCaptureMore: 'កត់ត្រាការអាប់ដេតមួយទៀត',
  skuVmActMonitor: 'បន្តតាមដាន',
  skuVmNextTouchMonitor: 'បន្តតាមដាន SKU នេះ។',
  skuVmNextTouchCaptureSecond: 'កត់ត្រាការអាប់ដេតលើកទីពីរ។',
  skuVmNextTouchReceiptOverdue: 'រយៈពេលដឹកមកដល់កំពុងយឺត។',
  skuVmNextTouchExpectedReceipt: 'រយៈពេលដឹកមកដល់ដែលរំពឹង។',
  skuVmNextTouchObservationStale: 'ការអាប់ដេតចុងក្រោយកំពុងចាស់ទៅ។',
  skuVmNextTouchRoutineCheck: 'រៀបចំការត្រួតពិនិត្យជាប្រចាំបន្ទាប់។',
  skuVmPipelineEventReceived: 'បានទទួល',
  skuVmPipelineEventPlaced: 'បានបញ្ជាទិញ',
  skuVmHeadlineUnits: 'ទំនងជាមានក្នុងស្តុក {units} ឯកតា',
  skuVmOpenOrderSingular: 'ការបញ្ជាទិញ {count} កំពុងមកដល់',
  skuVmOpenOrderPlural: 'ការបញ្ជាទិញ {count} កំពុងមកដល់',
  skuVmRibbonOnHand: 'ក្នុងស្តុក',
  skuVmRibbonOnTheWay: 'កំពុងមកដល់',
  skuVmRibbonDemandPerDay: 'តម្រូវការ / ថ្ងៃ',
  skuVmRibbonNextDelivery: 'ការដឹកមកដល់បន្ទាប់',
  skuVmLatestInterval: 'ចន្លោះពេលចុងក្រោយ',
  skuVmActWhy: 'ហេតុផល៖ {cover} cover និងមាន {inTransit} កំពុងមកដល់។',
  skuVmOpenPipelineOnTheWay: 'កំពុងមកដល់ {units}',
  skuVmOpenPipelineOrderProbability: 'ទំនុកចិត្តការបញ្ជាទិញ {probability}',
  skuVmOpenPipelineAge: 'អាយុ {age}',
  skuVmOpenPipelineReceipt: 'ការដឹកមកដល់បន្ទាប់ {receipt}',
  serviceVmReceiptLoggedFor: 'បានកត់ត្រាការដឹកមកដល់របស់ {name}',
  serviceVmReceiptQuantity: '+{count} ឯកតា',
  serviceVmInboundMayRestore: 'ការដឹកមកដល់របស់ {name} អាចស្តារភាពមានស្រាប់ឡើងវិញ',
  serviceVmInboundQuantity: '~{count} ឯកតាកំពុងមកដល់',
  serviceVmNotBindingYet: '{name} មិនទាន់ជាចំណុចរារាំងទេ។',
  serviceVmHeroNextBlockerTimed: 'ក្នុង {days} ថ្ងៃ',
  serviceVmHeroNextBlockerPending: 'ពេលវេលានៅមិនទាន់ច្បាស់',
  serviceVmHeroInboundVisible: '{count} {noun} កំពុងមកដល់ អាចស្តារភាពមានស្រាប់ឡើងវិញ',
  serviceVmHeroNoInboundVisible: 'មិនទាន់ឃើញការស្តារពីស្តុកកំពុងមកដល់ទេ',
  serviceVmInboundSingular: 'ការដឹកមកដល់',
  serviceVmInboundPlural: 'ការដឹកមកដល់',
  serviceVmOverviewTimingPending: 'ពេលវេលានៅតែកំពុងត្រូវបានកំណត់ពីភស្តុតាងចុងក្រោយ។',
  serviceVmOverviewIncoming: '{count} {noun} កំពុងមកដល់ដែលភ្ជាប់ អាចស្តារភាពមានស្រាប់ឡើងវិញ។',
  serviceVmOverviewIncomingSingular: 'ការដឹកមកដល់',
  serviceVmOverviewIncomingPlural: 'ការដឹកមកដល់',
  serviceVmRibbonDemandPerDay: 'តម្រូវការ / ថ្ងៃ',
  serviceVmRibbonLinkedSkuHealth: 'ស្ថានភាព SKU ដែលភ្ជាប់',
  serviceVmPending: 'កំពុងរង់ចាំ',
  serviceVmNoLinks: 'មិនមានការភ្ជាប់',
  serviceVmOverviewTitleUnblock: 'ដោះស្រាយការរារាំង {name}',
  serviceVmOverviewTitleProtect: 'ការពារ {name}',
  performanceVmOnTheWay: 'កំពុងមកដល់',
  performanceVmPartialReceived: 'បានទទួលមួយផ្នែក',
  performanceVmDueSoon: 'ជិតដល់ពេល',
  performanceVmMarginUnknown: 'មិនទាន់ដឹងប្រាក់ចំណេញ',
  performanceVmHealthyMargin: 'ប្រាក់ចំណេញល្អ',
  performanceVmStableMargin: 'ប្រាក់ចំណេញមានស្ថិរភាព',
  performanceVmMarginPressure: 'សម្ពាធលើប្រាក់ចំណេញ',
  performanceVmCapacityHolding: 'សមត្ថភាពកំពុងទប់ទល់',
  performanceVmPartiallyCoverable: 'អាចគ្របដណ្តប់បានមួយផ្នែក',
  performanceVmBlockedBySupply: 'ត្រូវបានរារាំងដោយការផ្គត់ផ្គង់',
  performanceVmRibbonDemandMomentum: 'សន្ទុះតម្រូវការ',
  performanceVmRibbonMarginHealth: 'សុខភាពប្រាក់ចំណេញ',
  performanceVmLastUpdated: 'បានអាប់ដេត {date} · {window}',
  performanceRouteDemandTrendHeader: 'និន្នាការតម្រូវការ',
  performanceRouteDemandTrendHeaderTooltip: 'ទិសដៅតម្រូវការថ្មីៗ សម្រាប់បង្អួចដែលបានជ្រើស។',
  performanceRouteSupportHeaderTooltip:
    'តម្រូវការបច្ចុប្បន្នប៉ុន្មាន ដែលអាចបំពេញបានពិត ជាមួយការគាំទ្របច្ចុប្បន្ន។',
  performanceRoutePipelineSupportHeader: 'ការគាំទ្រកំពុងមកដល់',
  performanceRoutePriceMarginHeaderTooltip:
    'ថាស្ថានភាពតម្លៃ និងប្រាក់ចំណេញ កំពុងជួយ ស្ថិតស្មើ ឬកំពុងតានតឹង។',
  performanceRouteCashTitle: 'ប្រសិទ្ធភាពសាច់ប្រាក់ និងប្រាក់ចំណេញ',
  performanceRouteCashTooltip:
    'ការរៀបចំក្រុមធាតុតាមការចាប់យកឱកាស ការរាំងស្ទះប្រាក់ចំណេញ និងសាច់ប្រាក់ដែលជាប់គាំង។',
  performanceRouteBandWinners: 'ធាតុល្អបំផុត',
  performanceRouteBandWinnersTooltip:
    'ជួរដែលមានតម្រូវការល្អ ប្រាក់ចំណេញល្អ និងមានការគាំទ្រគ្រប់គ្រាន់សម្រាប់ចាប់យកឱកាស។',
  performanceRouteBandBlockedProfit: 'ប្រាក់ចំណេញដែលត្រូវបានរារាំង',
  performanceRouteBandCashTraps: 'សាច់ប្រាក់ជាប់គាំង',
  performanceRouteBandEmpty: 'ឥឡូវនេះមិនមានធាតុណាស្ថិតក្នុងក្រុមនេះទេ។',
  performanceRouteOperationalDragTitle: 'ការទាញថយប្រតិបត្តិការ',
  performanceRouteOperationalDragTooltip:
    'កម្រិតរាំងស្ទះក្នុងការងារបច្ចុប្បន្ន ដែលកំពុងកំណត់សមត្ថភាពអាជីវកម្ម។',
  performanceRouteRecoveryPipelineTitle: 'ផ្លូវស្តារឡើងវិញ',
  performanceRouteConfidenceTooltip: 'ភស្តុតាងគាំទ្រទិដ្ឋភាពនេះប៉ុន្មាន និងកន្លែងណាខ្សោយបំផុត។',
  performanceRouteConfidenceLastUpdate: 'ការអាប់ដេតពិតចុងក្រោយ {value}',
  performanceRouteConfidenceLeastCertain: 'មិនច្បាស់បំផុត {value}',
  performanceRouteTimelineTooltip: 'ការផ្លាស់ប្តូរសំខាន់ៗដែលបានបង្កើតស្ថានភាពអាជីវកម្មបច្ចុប្បន្ន។',
  performanceRouteTimelineDescriptor: 'អ្វីដែលបានផ្លាស់ប្តូរនៅទូទាំងអាជីវកម្ម។',
  analysisWorkbenchSettingsIntervalsTooltip: 'ចំនួនចន្លោះពេលគំរូដែលកំពុងបង្ហាញ។',
  analysisWorkbenchSettingsSmoothingTooltip: 'ថាតើបានអនុវត្តការធ្វើឲ្យរលោង មុនពេលបង្ហាញសេចក្តីសង្ខេបឬអត់។',
  analysisWorkbenchSettingsSampleSizeTooltip:
    'ការប៉ាន់ស្មានថា មានភស្តុតាងឯករាជ្យប៉ុន្មាន កំពុងគាំទ្រការវាយតម្លៃនេះ។',
  analysisWorkbenchSettingsCoverageTooltip:
    'ចំណែកនៃផ្ទៃភស្តុតាងដែលរំពឹងទុក ដែលត្រូវបានសង្កេតឃើញពិត។',
  analysisWorkbenchSettingsScopeTooltip: 'ផ្នែកធាតុដែលត្រូវបានបញ្ចូលក្នុងការរត់នេះ។',
  analysisWorkbenchPressureScoreHeaderTooltip:
    'ពិន្ទុសម្ពាធរួមពី 0 ដល់ 100។ ពិន្ទុខ្ពស់មានន័យថាសម្ពាធប្រតិបត្តិការខ្លាំងជាងមុន។',
  analysisWorkbenchPriceSensitivityHeaderTooltip:
    'ថាលក្ខខណ្ឌតម្លៃ កំពុងប៉ះពាល់ដល់សម្ពាធប៉ុន្មាន។',
  analysisWorkbenchObservationChannelsHeaderTooltip: 'ប្រភេទភស្តុតាងណាខ្លះ ដែលមាននៅក្នុងការសង្កេតនេះ។',
  analysisWorkbenchChannelsRailTooltip: 'ប្រភេទភស្តុតាងដែលមាននៅក្នុងការសង្កេតនេះ។',
  analysisWorkbenchNoNamedEntityInObservation: 'មិនមានធាតុដែលមានឈ្មោះក្នុងការសង្កេតនេះទេ។',
  analysisWorkbenchNoNamedEntityInInterval: 'មិនមានធាតុដែលមានឈ្មោះ ត្រូវបានកំណត់សម្រាប់រយៈពេលនេះទេ។',
  analysisWorkbenchPipelineSpanAria: '{inTransit} កំពុងមកដល់, {ordered} បានបញ្ជាទិញ, {receipt} រំពឹងទុកការដឹកមកដល់',
  analysisWorkbenchPipelinePillLabel: '{count} កំពុងមកដល់',
  analysisWorkbenchOrderCueKind: 'ការបញ្ជាទិញ',
  analysisWorkbenchReceiptCueKind: 'ការដឹកមកដល់',
  analysisWorkbenchLeadTimeSelectedLabel: '{mean} +/- {spread} ថ្ងៃ',
  analysisWorkbenchChangePointProbability: 'លទ្ធភាពនៃការផ្លាស់ប្តូរ {value}',
  serviceVmRestorationReceiptDetail: 'ភស្តុតាងស្តុកថ្មីៗ បានធ្វើឲ្យទំនុកចិត្តលើការស្តារឡើងវិញប្រសើរឡើង។',
  serviceVmRestorationBottleneckDetail: 'ការដឹកមកដល់នេះ អាចជួយស្តារភាពមានស្រាប់របស់សេវាកម្មបានមុនគេ។',
  serviceVmRestorationSupportDetail: 'ការដឹកមកដល់នេះ គាំទ្រជំហានស្តារឡើងវិញបន្ទាប់។',
  serviceVmHeroSummary:
    'ចន្លោះដែលទំនង {low}-{high} · ចំណុចរារាំងសំខាន់៖ {bottleneck} · ហានិភ័យ {risk} · ចំណុចរារាំងបន្ទាប់ {nextBlocker} · {inbound}',
  performanceRouteEmptyCatalogHint:
    'បង្កើត SKU ដំបូង ដើម្បីឲ្យ Banji អាចប្រៀបធៀបតម្រូវការ ភាពមានស្រាប់ និងតម្លៃ ក្នុងទិដ្ឋភាពអាជីវកម្មតែមួយ។',
  performanceRouteEmptyWorkspaceTitle: 'ទំព័រសុខភាពអាជីវកម្ម ត្រូវការការវិភាគលើកដំបូង',
  performanceRouteEmptyWorkspaceHint:
    'កត់ត្រាការអាប់ដេតពិតមួយ ដើម្បីឲ្យ Banji អាចអានតម្រូវការ សមត្ថភាព ស្តុកកំពុងមកដល់ និងតម្លៃ ជាមួយគ្នា។',
  performanceRouteDescriptor: 'តម្រូវការ សមត្ថភាពដែលអាចប្រើបាន ស្តុកកំពុងមកដល់ និងតម្លៃ នៅក្នុងទិដ្ឋភាពអាជីវកម្មតែមួយ។',
  performanceRouteRefiningSignals: 'កំពុងផ្ទុកសញ្ញាស្តុកកំពុងមកដល់ និងសមត្ថភាពឡើងវិញ…',
  performanceRouteShowingCompare: 'កំពុងបង្ហាញស្ថានភាព {current} ប្រៀបនឹង {previous}',
  performanceRouteShowingSingle: 'កំពុងបង្ហាញតែស្ថានភាព {current}',
  performanceRouteMoveNowTooltip: 'ជួរសកម្មភាពអាជីវកម្មបច្ចុប្បន្ន ដែល Banji ណែនាំ។',
  performanceRouteMoveNowDescriptor: 'សកម្មភាពអាជីវកម្មដែលគួរធ្វើឥឡូវនេះ តាមលំដាប់ភាពបន្ទាន់ និងឱកាស។',
  performanceRouteMoveHeaderTooltip: 'សកម្មភាពអាជីវកម្មដែល Banji ណែនាំសម្រាប់ជួរនេះ។',
  performanceRouteWhyNowHeaderTooltip: 'លក្ខខណ្ឌអាជីវកម្មដែលធ្វើឲ្យសកម្មភាពនេះគួរធ្វើឥឡូវនេះ។',
  performanceRouteExpectedEffectHeaderTooltip: 'លទ្ធផលអាជីវកម្ម ដែល Banji រំពឹងថានឹងកើតឡើង ប្រសិនបើអ្នកធ្វើឥឡូវនេះ។',
  performanceRouteActionHeaderTooltip: 'កន្លែងដែលត្រូវទៅក្នុង Banji ដើម្បីធ្វើសកម្មភាពបន្តលើជួរនេះ។',
  performanceRouteBoardTooltip: 'ទិដ្ឋភាពចម្រុះនៃតម្រូវការ ការគាំទ្រ ស្តុកកំពុងមកដល់ និងស្ថានភាពប្រាក់ចំណេញ។',
  performanceRouteBoardDescriptor: 'ពិនិត្យសេវាកម្ម និង SKU ជាមួយគ្នាក្នុងល្បឿនតែមួយ។',
};

const exactValueTranslations: Record<string, string> = {
  Overview: 'ទិដ្ឋភាពទូទៅ',
  Catalog: 'កាតាឡុក',
  Settings: 'ការកំណត់',
  Analysis: 'ការវិភាគ',
  Workbench: 'តុការងារ',
  Risks: 'ហានិភ័យ',
  Observations: 'ការសង្កេត',
  Blockers: 'ចំណុចរារាំង',
  Workflows: 'លំហូរការងារ',
  Main: 'សំខាន់',
  Other: 'ផ្សេងទៀត',
  Planning: 'ផែនការ',
  Logs: 'កំណត់ហេតុ',
  Operations: 'ប្រតិបត្តិការ',
  'Business health': 'សុខភាពអាជីវកម្ម',
  Performance: 'សុខភាពអាជីវកម្ម',
  'Update Sheet': 'ផ្ទាំងអាប់ដេត',
  Merchandising: 'ការរៀបចំលក់',
  'Search and segment': 'ស្វែងរក និងបែងចែក',
  'Search name, description, or id…': 'ស្វែងរកឈ្មោះ ការពិពណ៌នា ឬលេខសម្គាល់…',
  Expand: 'ពង្រីក',
  Collapse: 'បង្រួម',
  'Back to catalog': 'ត្រឡប់ទៅកាតាឡុក',
  'Skip to content': 'រំលងទៅមាតិកា',
  'Open navigation': 'បើកម៉ឺនុយ',
  'Collapse navigation': 'បង្រួមម៉ឺនុយ',
  'Retry workspace load': 'សាកល្បងផ្ទុកកន្លែងធ្វើការម្ដងទៀត',
  'Record update': 'កត់ត្រាការអាប់ដេត',
  Recommendation: 'ការណែនាំ',
  'Recommended next move': 'ជំហានបន្ទាប់ដែលបានណែនាំ',
  'Why this action now': 'ហេតុអ្វីត្រូវធ្វើឥឡូវនេះ',
  'Latest change': 'ការផ្លាស់ប្តូរចុងក្រោយ',
  'What this page is for': 'ទំព័រនេះសម្រាប់អ្វី',
  'Add first SKU': 'បន្ថែម SKU ដំបូង',
  'Start first update session': 'ចាប់ផ្តើមវគ្គអាប់ដេតដំបូង',
  'Review reorder priorities': 'ពិនិត្យអាទិភាពបញ្ជាទិញបន្ថែម',
  'Start update session': 'ចាប់ផ្តើមវគ្គអាប់ដេត',
  'Open catalog': 'បើកកាតាឡុក',
  'Open logs': 'បើកកំណត់ហេតុ',
  'Open planning': 'បើកផែនការ',
  'Open reorder queue': 'បើកជួរបញ្ជាទិញបន្ថែម',
  'Review recent activity': 'ពិនិត្យសកម្មភាពថ្មីៗ',
  'Needs attention': 'ត្រូវយកចិត្តទុកដាក់',
  'Planning queue': 'ជួរផែនការ',
  'Reorder now': 'បញ្ជាទិញឥឡូវនេះ',
  'High risk': 'ហានិភ័យខ្ពស់',
  'Service impact': 'ផលប៉ះពាល់លើសេវាកម្ម',
  Critical: 'ធ្ងន់ធ្ងរ',
  'At risk': 'មានហានិភ័យ',
  Watch: 'តាមដាន',
  risk: 'ហានិភ័យ',
  service: 'សេវាកម្ម',
  services: 'សេវាកម្ម',
  'low confidence': 'ទំនុកចិត្តទាប',
  'Recent activity': 'សកម្មភាពថ្មីៗ',
  'Quick actions': 'សកម្មភាពរហ័ស',
  'Support metrics': 'សូចនាករជំនួយ',
  'Warm, local-first retail logs': 'កំណត់ហេតុលក់លើម៉ាស៊ីន',
  'Inventory value': 'តម្លៃស្តុក',
  'Sale-ready SKUs': 'SKU ដែលអាចលក់បាន',
  'Service bundles': 'បណ្ដុំសេវាកម្ម',
  'Merchandising slots': 'ទីតាំងរៀបចំលក់',
  'Units on hand': 'ឯកតាក្នុងស្តុក',
  'Catalog coverage': 'ការគ្របដណ្តប់កាតាឡុក',
  'Local runtime': 'ស្ថានភាពក្នុងម៉ាស៊ីន',
  'Connected and ready for edits': 'ភ្ជាប់រួច ហើយត្រៀមសម្រាប់កែប្រែ',
  'The local API needs attention before changes can be saved':
    'API ក្នុងម៉ាស៊ីនត្រូវការពិនិត្យ មុនពេលអាចរក្សាទុកការផ្លាស់ប្តូរ។',
  'Current featured order': 'លំដាប់លក់ដែលលេចធ្លោឥឡូវនេះ',
  'Quick capture': 'ការកត់ត្រារហ័ស',
  'Planning pulse': 'ស្ថានភាពផែនការ',
  'Reorders likely': 'ទំនងត្រូវបញ្ជាទិញបន្ថែម',
  'Dominant regime': 'លំនាំសំខាន់',
  'Planning freshness': 'ភាពទាន់សម័យនៃផែនការ',
  Everything: 'ទាំងអស់',
  SKUs: 'SKU',
  Services: 'សេវាកម្ម',
  'View all SKUs': 'មើល SKU ទាំងអស់',
  'View all services': 'មើលសេវាកម្មទាំងអស់',
  and: 'និង',
  'matching for': 'ត្រូវនឹង',
  Edit: 'កែ',
  'New SKU': 'SKU ថ្មី',
  Status: 'ស្ថានភាព',
  'Linked SKUs': 'SKU ដែលភ្ជាប់',
  'Potential revenue': 'ចំណូលសក្តានុពល',
  'Potential gross margin': 'ប្រាក់ចំណេញដុលសក្តានុពល',
  'Internal only': 'សម្រាប់ប្រើខាងក្នុងប៉ុណ្ណោះ',
  'SKU value metric': 'សូចនាករតម្លៃ SKU',
  Revenue: 'ចំណូល',
  'Gross margin': 'ប្រាក់ចំណេញដុល',
  'No matching catalog items': 'រកមិនឃើញធាតុកាតាឡុកដែលត្រូវគ្នា',
  'Clear filters': 'សម្អាតតម្រង',
  'Create new SKU': 'បង្កើត SKU ថ្មី',
  'Start the catalog': 'ចាប់ផ្តើមកាតាឡុក',
  'Create first SKU': 'បង្កើត SKU ដំបូង',
  'Days of cover': 'ថ្ងៃគ្រប់គ្រាន់',
  'Stockout risk': 'ហានិភ័យអស់ស្តុក',
  'Reorder point': 'ចំណុចបញ្ជាទិញបន្ថែម',
  Confidence: 'ទំនុកចិត្ត',
  'Lead time': 'ពេលវេលាមកដល់',
  'SKU detail': 'ព័ត៌មាន SKU',
  'Stock snapshot': 'ស្ថានភាពស្តុក',
  'Key signals': 'សញ្ញាសំខាន់',
  'Record stock': 'កត់ត្រាស្តុក',
  'Log order': 'កត់ត្រាការបញ្ជាទិញ',
  'Log receipt': 'កត់ត្រាការទទួលទំនិញ',
  'Update price': 'អាប់ដេតតម្លៃ',
  'SKU timeline': 'បន្ទាត់ពេលវេលា SKU',
  'Recent evidence': 'ភស្តុតាងថ្មីៗ',
  'Selected interval': 'ចន្លោះពេលដែលបានជ្រើស',
  'Act now': 'ត្រូវធ្វើឥឡូវនេះ',
  'Incoming stock': 'ស្តុកកំពុងមកដល់',
  'Service pressure': 'សម្ពាធលើសេវាកម្ម',
  'Next check': 'ពិនិត្យបន្ទាប់',
  'Preparing details': 'កំពុងរៀបចំព័ត៌មានលម្អិត',
  'Refreshing details': 'កំពុងធ្វើបច្ចុប្បន្នភាពព័ត៌មានលម្អិត',
  'Mutation failed.': 'ការផ្លាស់ប្តូរបរាជ័យ។',
  'This SKU is not sold directly to customers.': 'SKU នេះមិនត្រូវបានលក់ផ្ទាល់ទៅអតិថិជនទេ។',
  'Observed at': 'បានសង្កេតនៅ',
  'Units in stock': 'ឯកតាក្នុងស្តុក',
  'Cost per unit': 'ថ្លៃដើមក្នុងមួយឯកតា',
  'Product price': 'តម្លៃលក់',
  'Approximate order quantity': 'បរិមាណបញ្ជាទិញប្រហាក់ប្រហែល',
  'Typical lead time days': 'ចំនួនថ្ងៃមកដល់ជាទូទៅ',
  'Lead time variability': 'ការប្រែប្រួលពេលវេលាមកដល់',
  Notes: 'កំណត់ចំណាំ',
  'Save and refresh view': 'រក្សាទុក ហើយផ្ទុកទិដ្ឋភាពឡើងវិញ',
  'Sales pattern and price': 'លំនាំលក់ និងតម្លៃ',
  'Stock estimate': 'ការប៉ាន់ស្មានស្តុក',
  'Safety stock': 'ស្តុកសុវត្ថិភាព',
  'What changed stock': 'អ្វីបានធ្វើឲ្យស្តុកផ្លាស់ប្តូរ',
  'Incoming stock timeline': 'បន្ទាត់ពេលវេលាស្តុកកំពុងមកដល់',
  First: 'ដំបូង',
  Last: 'ចុងក្រោយ',
  'Regime lane': 'ផ្លូវលំនាំ',
  'Retail price line': 'ខ្សែតម្លៃលក់រាយ',
  Language: 'ភាសា',
  Currency: 'រូបិយប័ណ្ណ',
  English: 'អង់គ្លេស',
  Khmer: 'ខ្មែរ',
  'USD ($)': 'ដុល្លារ ($)',
  'KHR (៛)': 'រៀល (៛)',
  'Desktop preferences': 'ចំណូលចិត្តសម្រាប់ desktop',
  'Save preferences': 'រក្សាទុកចំណូលចិត្ត',
  'Workspace preferences': 'ចំណូលចិត្តកន្លែងធ្វើការ',
  'Exchange rate': 'អត្រាប្ដូរប្រាក់',
  'Interface visibility': 'ការបង្ហាញផ្ទៃមុខ',
  'Show extra guidance': 'បង្ហាញការណែនាំបន្ថែម',
  'Keep actions pinned': 'រក្សាសកម្មភាពឲ្យនៅជាប់',
  'Reset to defaults': 'កំណត់តម្លៃលំនាំដើមឡើងវិញ',
  'Analysis profile': 'ទម្រង់វិភាគ',
  'Recommended order level': 'កម្រិតបញ្ជាទិញដែលបានណែនាំ',
  'Suggested range start': 'ចំណុចចាប់ផ្តើមនៃជួរណែនាំ',
  'Suggested range end': 'ចំណុចបញ្ចប់នៃជួរណែនាំ',
  'Reorder signal threshold': 'កម្រិតសញ្ញាបញ្ជាទិញបន្ថែម',
  'Extra safety days': 'ថ្ងៃសុវត្ថិភាពបន្ថែម',
  'Soften noisy charts': 'ធ្វើឲ្យក្រាបរលោង',
  'Local workspace data': 'ទិន្នន័យកន្លែងធ្វើការក្នុងម៉ាស៊ីន',
  'Data directory': 'ថតទិន្នន័យ',
  'Workspace store': 'កន្លែងផ្ទុកទិន្នន័យ',
  'Preferences file': 'ឯកសារចំណូលចិត្ត',
  'Open local data folder': 'បើកថតទិន្នន័យក្នុងម៉ាស៊ីន',
  'Export Logs': 'នាំចេញកំណត់ហេតុ',
  'Export SENA data': 'នាំចេញទិន្នន័យផែនការ',
  'Local-only storage': 'ការផ្ទុកក្នុងម៉ាស៊ីនប៉ុណ្ណោះ',
  Unsaved: 'មិនទាន់រក្សាទុក',
  'Reset changes': 'កំណត់ការផ្លាស់ប្តូរឡើងវិញ',
  'Copy data path': 'ចម្លងផ្លូវទិន្នន័យ',
  'Export data': 'នាំចេញទិន្នន័យ',
  'Export SKUs CSV': 'នាំចេញ SKU CSV',
  Exported: 'បាននាំចេញ',
  'Khmer (ខ្មែរ)': 'ខ្មែរ (ខ្មែរ)',
  'Regional formatting': 'ទម្រង់តំបន់',
  'Loading local workspace details…': 'កំពុងផ្ទុកព័ត៌មានកន្លែងធ្វើការក្នុងម៉ាស៊ីន…',
  'Collapse credits': 'បង្រួមចំណាំ',
  'Expand credits': 'ពង្រីកចំណាំ',
  'Made with': 'បង្កើតដោយប្រើ',
  'by Monysovann Ly.': 'ដោយ Monysovann Ly។',
  'Run ID': 'លេខសម្គាល់ការរត់',
  'Latest observed': 'បានសង្កេតចុងក្រោយ',
  'Observations used': 'ការសង្កេតដែលបានប្រើ',
  'Intervals in view': 'ចន្លោះពេលដែលកំពុងបង្ហាញ',
  Smoothing: 'ការធ្វើឲ្យរលោង',
  'Stability sample size': 'ទំហំគំរូស្ថិរភាព',
  'Prediction gap': 'គម្លាតការព្យាករណ៍',
  'Coverage level': 'កម្រិតការគ្របដណ្តប់',
  Scope: 'វិសាលភាព',
  Quiet: 'ស្ងប់ស្ងាត់',
  'No signal': 'មិនមានសញ្ញា',
  'Select analysis surface': 'ជ្រើសផ្ទាំងវិភាគ',
  'System timeline': 'បន្ទាត់ពេលវេលាប្រព័ន្ធ',
  'Price cue count': 'ចំនួនសញ្ញាតម្លៃ',
  'Stockout cue count': 'ចំនួនសញ្ញាអស់ស្តុក',
  'Stock estimate and demand': 'ការប៉ាន់ស្មានស្តុក និងតម្រូវការ',
  'Service demand': 'តម្រូវការសេវាកម្ម',
  'Retail demand': 'តម្រូវការលក់រាយ',
  Receipts: 'ការទទួលទំនិញ',
  Adjustments: 'ការកែសម្រួល',
  'On-the-way window': 'រយៈពេលកំពុងមកដល់',
  'Late window': 'រយៈពេលយឺត',
  'Order cue': 'សញ្ញាបញ្ជាទិញ',
  'Receipt cue': 'សញ្ញាទទួលទំនិញ',
  'Delivery timing': 'ពេលវេលាមកដល់',
  'Timing spread': 'ការប្រែប្រួលពេលវេលា',
  'Typical timing': 'ពេលវេលាទូទៅ',
  'No named entity': 'មិនមានឈ្មោះធាតុ',
  'Risk explorer': 'ផ្ទាំងស្វែងរកហានិភ័យ',
  'Pressure score': 'ពិន្ទុសម្ពាធ',
  'Incoming risk': 'ហានិភ័យស្តុកកំពុងមកដល់',
  'Delivery timing risk': 'ហានិភ័យពេលវេលាមកដល់',
  'Price sensitivity': 'ភាពងាយរងឥទ្ធិពលពីតម្លៃ',
  'Observation ledger': 'បញ្ជីការសង្កេត',
  'Analysis details': 'ព័ត៌មានលម្អិតនៃការវិភាគ',
  'Select analysis scope': 'ជ្រើសវិសាលភាពវិភាគ',
  'Refresh analysis': 'ផ្ទុកការវិភាគឡើងវិញ',
  'Loading item details…': 'កំពុងផ្ទុកព័ត៌មានលម្អិតធាតុ…',
  'Open overview': 'បើក Overview',
  Observed: 'បានសង្កេត',
  'Observation channels': 'ប្រភេទសញ្ញា',
  'Affected entities': 'ធាតុដែលរងផលប៉ះពាល់',
  'Service blocker map': 'ផែនទីចំណុចរារាំងសេវាកម្ម',
  Usage: 'ការប្រើប្រាស់',
  Blocker: 'ចំណុចរារាំង',
  Observation: 'ការសង្កេត',
  Channels: 'ប្រភេទសញ្ញា',
  'Interval explanation': 'ការពន្យល់ចន្លោះពេល',
  'Observed signals': 'សញ្ញាដែលបានកត់ត្រា',
  'What happened': 'អ្វីបានកើតឡើង',
  'Orders, incoming stock, delivery timing': 'ការបញ្ជាទិញ ស្តុកកំពុងមកដល់ និងពេលវេលាមកដល់',
  'In transit': 'កំពុងដឹកមកដល់',
  'Order probability': 'លទ្ធភាពបញ្ជាទិញ',
  'Order quantity': 'បរិមាណបញ្ជាទិញ',
  'Receipt quantity': 'បរិមាណដែលបានទទួល',
  'Transit age': 'រយៈពេលដែលកំពុងដឹក',
  'Timing class': 'កម្រិតពេលវេលា',
  'Selected SKU': 'SKU ដែលបានជ្រើស',
  'Selected service': 'សេវាកម្មដែលបានជ្រើស',
  'Current estimate': 'ការប៉ាន់ស្មានបច្ចុប្បន្ន',
  'Estimated units': 'ឯកតាប៉ាន់ស្មាន',
  'Demand per day': 'តម្រូវការក្នុងមួយថ្ងៃ',
  'Reorder trigger': 'សញ្ញាបញ្ជាទិញបន្ថែម',
  'Reorder policy': 'គោលការណ៍បញ្ជាទិញបន្ថែម',
  'Need probability': 'លទ្ធភាពត្រូវបញ្ជាទិញ',
  'Recommended order': 'បរិមាណណែនាំឱ្យបញ្ជាទិញ',
  'Likely range': 'ចន្លោះដែលទំនង',
  'Protection horizon': 'រយៈពេលការពារ',
  'Policy basis': 'មូលដ្ឋាននៃការណែនាំ',
  'Main contributors': 'មូលហេតុសំខាន់',
  'No contributor stack available for this entity.': 'មិនមានបញ្ជីមូលហេតុសំខាន់សម្រាប់ធាតុនេះទេ។',
  'Current system picture': 'ស្ថានភាពប្រព័ន្ធបច្ចុប្បន្ន',
  'Strongest channels': 'ឆានែលសំខាន់បំផុត',
  Priority: 'អាទិភាព',
  Counted: 'បានរាប់',
  'All SKUs': 'SKU ទាំងអស់',
  'Record update details': 'ព័ត៌មានលម្អិតការអាប់ដេត',
  'Count SKU stock': 'រាប់ស្តុក SKU',
  'Add service updates': 'បន្ថែមការអាប់ដេតសេវាកម្ម',
  'Rank recent selling order': 'កំណត់លំដាប់លក់ថ្មីៗ',
  'Review update': 'ពិនិត្យការអាប់ដេត',
  'Stock count view': 'ទិដ្ឋភាពរាប់ស្តុក',
  'SKU / latest update': 'SKU / ការអាប់ដេតចុងក្រោយ',
  Flags: 'សញ្ញា',
  'Add flags': 'បន្ថែមសញ្ញា',
  Event: 'ព្រឹត្តិការណ៍',
  'Ordered amount': 'បរិមាណដែលបានបញ្ជាទិញ',
  'Delivered amount': 'បរិមាណដែលបានទទួល',
  Blocked: 'ត្រូវរារាំង',
  Stockout: 'អស់ស្តុក',
  'No row flags added.': 'មិនទាន់មានសញ្ញាជួរបន្ថែមទេ។',
  'Remove order': 'ដកការបញ្ជាទិញចេញ',
  'Add order': 'បន្ថែមការបញ្ជាទិញ',
  'Remove receipt': 'ដកការទទួលទំនិញចេញ',
  'Add receipt': 'បន្ថែមការទទួលទំនិញ',
  'Remove event': 'ដកព្រឹត្តិការណ៍ចេញ',
  'Add event': 'បន្ថែមព្រឹត្តិការណ៍',
  'No SKUs match this stock view yet.': 'មិនទាន់មាន SKU ណាត្រូវនឹងទិដ្ឋភាពស្តុកនេះទេ។',
  Service: 'សេវាកម្ម',
  'Latest price': 'តម្លៃចុងក្រោយ',
  'Price if changed': 'តម្លៃ ប្រសិនបើបានផ្លាស់ប្តូរ',
  'New price': 'តម្លៃថ្មី',
  'Remove price change': 'ដកការផ្លាស់ប្តូរតម្លៃចេញ',
  'Add price change': 'បន្ថែមការផ្លាស់ប្តូរតម្លៃ',
  'Overall sales pattern': 'លំនាំលក់សរុប',
  '(optional)': '(ស្រេចចិត្ត)',
  'No sales-pattern signal': 'មិនមានសញ្ញាលំនាំលក់',
  'Normal pattern': 'លំនាំធម្មតា',
  'Demand spike': 'តម្រូវការកើនខ្លាំង',
  'Demand lull': 'តម្រូវការធ្លាក់ចុះ',
  'Stock-limited pattern': 'លំនាំដែលត្រូវបានកំណត់ដោយស្តុក',
  'Promotion pattern': 'លំនាំពេលផ្សព្វផ្សាយ',
  'Correction pattern': 'លំនាំកែសម្រួល',
  'No structured signals yet': 'មិនទាន់មានសញ្ញាដែលមានរចនាសម្ព័ន្ធទេ',
  'Count at least one SKU': 'រាប់ SKU យ៉ាងហោចណាស់មួយ',
  'Optional on later updates': 'ស្រេចចិត្តសម្រាប់ការអាប់ដេតបន្ទាប់ៗ',
  Optional: 'ស្រេចចិត្ត',
  'Observed time, notes, sales pattern': 'ពេលវេលាដែលបានសង្កេត កំណត់ចំណាំ និងលំនាំលក់',
  'Not ready yet': 'មិនទាន់រួចរាល់',
  'Ready to save': 'រួចរាល់សម្រាប់រក្សាទុក',
  'Discard changes': 'បោះបង់ការផ្លាស់ប្តូរ',
  'Last confirmed update': 'ការអាប់ដេតដែលបានបញ្ជាក់ចុងក្រោយ',
  'No prior update': 'មិនទាន់មានការអាប់ដេតមុនទេ',
  'Interval length': 'រយៈពេលចន្លោះ',
  'First interval': 'ចន្លោះពេលដំបូង',
  'Untouched SKUs stay unchanged': 'SKU ដែលមិនបានប៉ះ ពឹងនៅដដែល',
  'Full update': 'ការអាប់ដេតពេញលេញ',
  'Partial update': 'ការអាប់ដេតមួយផ្នែក',
  unknown: 'មិនស្គាល់',
  'No delivery window yet': 'មិនទាន់មានរយៈពេលដឹកមកដល់ទេ',
  Late: 'យឺត',
  'No recent delivery pattern signal': 'មិនទាន់មានសញ្ញាលំនាំពេលដឹកមកដល់ថ្មីៗទេ',
  variability: 'ការប្រែប្រួល',
  'Needs review': 'ត្រូវពិនិត្យ',
  Reorder: 'បញ្ជាទិញបន្ថែម',
  'Waiting for delivery': 'កំពុងរង់ចាំការដឹកមកដល់',
  Healthy: 'ល្អប្រសើរ',
  'No interval selected': 'មិនទាន់បានជ្រើសចន្លោះពេល',
  'Deliveries added stock in this interval': 'ការដឹកមកដល់បានបន្ថែមស្តុកក្នុងចន្លោះពេលនេះ',
  'Manual adjustments drove this interval': 'ការកែសម្រួលដោយដៃបានប៉ះពាល់ចន្លោះពេលនេះ',
  'Service demand led this interval': 'តម្រូវការសេវាកម្មជាកត្តាសំខាន់ក្នុងចន្លោះពេលនេះ',
  'Retail demand led this interval': 'តម្រូវការលក់រាយជាកត្តាសំខាន់ក្នុងចន្លោះពេលនេះ',
  'Demand moved through this interval': 'មានតម្រូវការកើតឡើងក្នុងចន្លោះពេលនេះ',
  'No demand was recorded in this interval': 'មិនមានតម្រូវការត្រូវបានកត់ត្រាក្នុងចន្លោះពេលនេះទេ។',
  'Choose an interval in the ledger to inspect it.': 'ជ្រើសចន្លោះពេលមួយក្នុងបន្ទាត់ពេលវេលា ដើម្បីពិនិត្យវា។',
  'Stock reported': 'បានរាយការណ៍ស្តុក',
  'Order placed': 'បានបញ្ជាទិញ',
  'Order update recorded': 'បានកត់ត្រាការអាប់ដេតការបញ្ជាទិញ',
  'Delivery logged': 'បានកត់ត្រាការដឹកមកដល់',
  'Delivery update recorded': 'បានកត់ត្រាការអាប់ដេតការដឹកមកដល់',
  'Price changed': 'តម្លៃបានផ្លាស់ប្តូរ',
  'Retail stockout': 'អស់ស្តុកលក់រាយ',
  'This SKU was marked out of stock for direct sales.': 'SKU នេះត្រូវបានសម្គាល់ថាអស់ស្តុកសម្រាប់ការលក់ផ្ទាល់។',
  'Delivery timing note': 'កំណត់ចំណាំអំពីពេលវេលាមកដល់',
  Today: 'ថ្ងៃនេះ',
  Tomorrow: 'ស្អែក',
  'Main blocker now': 'ចំណុចរារាំងសំខាន់ឥឡូវនេះ',
  'Next likely blocker': 'ចំណុចរារាំងបន្ទាប់ដែលទំនង',
  'Safe support': 'ការគាំទ្រដែលមានសុវត្ថិភាព',
  'Delivery confirmed': 'បានបញ្ជាក់ការដឹកមកដល់',
  'Delivery timing pending': 'ពេលវេលាដឹកមកដល់កំពុងរង់ចាំ',
  'Incoming quantity pending': 'បរិមាណកំពុងមកដល់ កំពុងរង់ចាំ',
  'Coverage pending': 'ការគ្របដណ្តប់កំពុងរង់ចាំ',
  'No linked delivery': 'មិនមានការដឹកមកដល់ដែលភ្ជាប់ទេ',
  'Logging stock or confirming the next delivery will change availability fastest.':
    'ការកត់ត្រាស្តុក ឬបញ្ជាក់ការដឹកមកដល់បន្ទាប់ នឹងធ្វើឲ្យភាពមានស្រាប់ផ្លាស់ប្តូរលឿនបំផុត។',
  'Keep this SKU under watch behind the current blocker.':
    'តាមដាន SKU នេះបន្ត នៅពីក្រោយចំណុចរារាំងបច្ចុប្បន្ន។',
  Available: 'អាចលក់បាន',
  Stable: 'មានស្ថិរភាព',
  Fragile: 'ងាយរងផលប៉ះពាល់',
  'High confidence': 'ទំនុកចិត្តខ្ពស់',
  'Medium confidence': 'ទំនុកចិត្តមធ្យម',
  'Low confidence': 'ទំនុកចិត្តទាប',
  'Performance needs the catalog first': 'ទំព័រសុខភាពអាជីវកម្ម ត្រូវការកាតាឡុកជាមុន',
  All: 'ទាំងអស់',
  'Compare view': 'ទិដ្ឋភាពប្រៀបធៀប',
  'Single view': 'ទិដ្ឋភាពតែមួយ',
  'Real-world update loaded': 'បានផ្ទុកការអាប់ដេតពិត',
  'No real-world update yet': 'មិនទាន់មានការអាប់ដេតពិតទេ',
  'Mixed portfolio view': 'ទិដ្ឋភាពចម្រុះ',
  'Services only': 'សេវាកម្មប៉ុណ្ណោះ',
  'SKUs only': 'SKU ប៉ុណ្ណោះ',
  'Move now': 'ត្រូវធ្វើឥឡូវនេះ',
  Move: 'សកម្មភាព',
  'Why now': 'ហេតុអ្វីឥឡូវនេះ',
  'Expected effect': 'លទ្ធផលដែលរំពឹង',
  Action: 'សកម្មភាពបន្ត',
  'Demand × capacity board': 'ផ្ទាំងតម្រូវការ × សមត្ថភាព',
  Item: 'ធាតុ',
  'Resume unfinished work': 'បន្តការងារដែលមិនទាន់ចប់',
  'Pick up the current draft on this device before starting a new update.':
    'បន្តសេចក្តីព្រាងបច្ចុប្បន្នលើឧបករណ៍នេះ មុនពេលចាប់ផ្តើមការអាប់ដេតថ្មី។',
  'No unfinished work right now.': 'ឥឡូវនេះមិនមានការងារមិនទាន់ចប់ទេ។',
  'Resume review': 'បន្តការពិនិត្យ',
  queued: 'កំពុងរង់ចាំ',
  'Latest report': 'របាយការណ៍ចុងក្រោយ',
  'Latest changed rows': 'ជួរដែលបានផ្លាស់ប្តូរចុងក្រោយ',
  Includes: 'រួមមាន',
  Showing: 'កំពុងបង្ហាញ',
  'No reports match': 'មិនមានរបាយការណ៍ណាត្រូវគ្នាទេ',
  report: 'របាយការណ៍',
  reports: 'របាយការណ៍',
  Source: 'ប្រភព',
  'No matching updates': 'មិនមានការអាប់ដេតណាត្រូវគ្នាទេ',
  'Delete report': 'លុបរបាយការណ៍',
  'Type this exactly to permanently delete the report:': 'វាយអក្សរនេះឲ្យត្រឹមត្រូវ ដើម្បីលុបរបាយការណ៍ជាអចិន្ត្រៃយ៍៖',
  'Search history': 'ស្វែងរកប្រវត្តិ',
  'Recent activity filters': 'តម្រងសកម្មភាពថ្មីៗ',
  Inspect: 'ពិនិត្យ',
  Hide: 'លាក់',
  'Change at least one SKU row before saving.': 'ផ្លាស់ប្តូរជួរ SKU យ៉ាងហោចណាស់មួយ មុនពេលរក្សាទុក។',
  'Ranking entries': 'ធាតុលំដាប់',
  'Top of list preview': 'ទិដ្ឋភាពមុននៃកំពូលបញ្ជី',
  'Shows how many items are currently in scope for this ranking.':
    'បង្ហាញថាធាតុប៉ុន្មាន កំពុងស្ថិតក្នុងវិសាលភាពសម្រាប់លំដាប់នេះ។',
  'entries in scope': 'ធាតុក្នុងវិសាលភាព',
  'Decision context': 'បរិបទសម្រាប់សេចក្តីសម្រេច',
  'You have unsaved changes': 'អ្នកមានការផ្លាស់ប្តូរមិនទាន់រក្សាទុក',
  'Why this order matters': 'ហេតុអ្វីលំដាប់នេះសំខាន់',
  'For your team': 'សម្រាប់ក្រុមរបស់អ្នក',
  'Shows what the team should push first or expects to sell first.':
    'បង្ហាញអ្វីដែលក្រុមគួរលើកមុខមុន ឬរំពឹងថានឹងលក់មុន។',
  'For SIST': 'សម្រាប់ SIST',
  'Demand pressure': 'សម្ពាធតម្រូវការ',
  'These are the first entries your team will see when deciding what to push first.':
    'ទាំងនេះគឺជាធាតុដំបូងដែលក្រុមរបស់អ្នកនឹងឃើញ ពេលសម្រេចថាអ្វីគួរលើកមុខមុន។',
  'Move up': 'ផ្លាស់ឡើងលើ',
  'Move down': 'ផ្លាស់ចុះក្រោម',
  'Save order': 'រក្សាទុកលំដាប់',
  Reset: 'កំណត់ឡើងវិញ',
  Rank: 'លំដាប់',
  Name: 'ឈ្មោះ',
  Type: 'ប្រភេទ',
  'You have unsaved ranking changes. Leave this page and discard the current draft?':
    'អ្នកមានការផ្លាស់ប្តូរលំដាប់មិនទាន់រក្សាទុក។ ចាកចេញពីទំព័រនេះ ហើយបោះបង់សេចក្តីព្រាងបច្ចុប្បន្នឬ?',
  'SKU editor': 'កម្មវិធីកែ SKU',
  Identifier: 'លេខសម្គាល់',
  Description: 'ការពិពណ៌នា',
  'Sell as product': 'លក់ជាផលិតផល',
  'Set the SKU name and description so staff can recognize it quickly.':
    'កំណត់ឈ្មោះ និងការពិពណ៌នា SKU ដើម្បីឲ្យបុគ្គលិកអាចស្គាល់វាបានរហ័ស។',
  'Change impact': 'ផលប៉ះពាល់នៃការផ្លាស់ប្តូរ',
  'Commercial setup': 'ការរៀបចំផ្នែកអាជីវកម្ម',
  selected: 'បានជ្រើស',
  'linked SKUs selected': 'បានជ្រើស SKU ដែលភ្ជាប់',
  'Limiting SKU': 'SKU ដែលកំពុងកំណត់',
  'Search linked SKUs by name or id…': 'ស្វែងរក SKU ដែលភ្ជាប់តាមឈ្មោះ ឬលេខសម្គាល់…',
  'Linked SKUs detected': 'បានរកឃើញ SKU ដែលភ្ជាប់',
  'Pricing updated': 'បានអាប់ដេតតម្លៃ',
  'Linked SKUs updated': 'បានអាប់ដេត SKU ដែលភ្ជាប់',
  'Keep the SKU name, cost basis, and direct-sell status aligned before it reaches the floor.':
    'រក្សាឈ្មោះ SKU មូលដ្ឋានថ្លៃដើម និងស្ថានភាពលក់ផ្ទាល់ ឲ្យត្រូវគ្នា មុនពេលវាទៅដល់កន្លែងលក់។',
  'Save changes': 'រក្សាទុកការផ្លាស់ប្តូរ',
  Cancel: 'បោះបង់',
  'You have unsaved changes.': 'អ្នកមានការផ្លាស់ប្តូរមិនទាន់រក្សាទុក។',
  'Enter a value for this field.': 'សូមបញ្ចូលតម្លៃសម្រាប់វាលនេះ។',
  'Enter zero or a higher number.': 'សូមបញ្ចូលសូន្យ ឬលេខដែលធំជាងនេះ។',
  'Enter a number greater than zero.': 'សូមបញ្ចូលលេខដែលធំជាងសូន្យ។',
  'Select at least one linked SKU before saving.': 'ជ្រើស SKU ដែលភ្ជាប់យ៉ាងហោចណាស់មួយ មុនពេលរក្សាទុក។',
  'Enter a valid date and time.': 'សូមបញ្ចូលកាលបរិច្ឆេទ និងពេលវេលាដែលត្រឹមត្រូវ។',
  Ready: 'រួចរាល់',
  Refreshing: 'កំពុងផ្ទុកឡើងវិញ',
  Stale: 'ចាស់',
  'Waiting for reports': 'កំពុងរង់ចាំរបាយការណ៍',
  Low: 'ទាប',
  Medium: 'មធ្យម',
  High: 'ខ្ពស់',
};

const phraseTranslations: ReadonlyArray<readonly [string, string]> = [
  ['Overview', 'ទិដ្ឋភាពទូទៅ'],
  ['overview', 'ទិដ្ឋភាពទូទៅ'],
  ['catalog', 'កាតាឡុក'],
  ['Catalog', 'កាតាឡុក'],
  ['settings', 'ការកំណត់'],
  ['Settings', 'ការកំណត់'],
  ['planning', 'ផែនការ'],
  ['Planning', 'ផែនការ'],
  ['analysis', 'ការវិភាគ'],
  ['Analysis', 'ការវិភាគ'],
  ['logs', 'កំណត់ហេតុ'],
  ['Logs', 'កំណត់ហេតុ'],
  ['record update', 'ការអាប់ដេត'],
  ['Record update', 'ការអាប់ដេត'],
  ['stock update', 'ការអាប់ដេតស្តុក'],
  ['update session', 'វគ្គអាប់ដេត'],
  ['reorder queue', 'ជួរបញ្ជាទិញបន្ថែម'],
  ['planning queue', 'ជួរផែនការ'],
  ['reorder pressure', 'សម្ពាធបញ្ជាទិញបន្ថែម'],
  ['reorder point', 'ចំណុចបញ្ជាទិញបន្ថែម'],
  ['reorder signal', 'សញ្ញាបញ្ជាទិញបន្ថែម'],
  ['reorder policy', 'គោលការណ៍បញ្ជាទិញបន្ថែម'],
  ['incoming stock', 'ស្តុកកំពុងមកដល់'],
  ['incoming exposure', 'ស្តុកកំពុងមកដល់'],
  ['incoming risk', 'ហានិភ័យស្តុកកំពុងមកដល់'],
  ['stock estimate', 'ការប៉ាន់ស្មានស្តុក'],
  ['current estimate', 'ការប៉ាន់ស្មានបច្ចុប្បន្ន'],
  ['latest estimate', 'ការប៉ាន់ស្មានចុងក្រោយ'],
  ['current picture', 'ស្ថានភាពបច្ចុប្បន្ន'],
  ['current reading', 'ការវាយតម្លៃបច្ចុប្បន្ន'],
  ['likely range', 'ចន្លោះដែលទំនង'],
  ['middle estimate', 'ចំណុចកណ្ដាល'],
  ['sales pattern', 'លំនាំលក់'],
  ['service impact', 'ផលប៉ះពាល់លើសេវាកម្ម'],
  ['service pressure', 'សម្ពាធលើសេវាកម្ម'],
  ['main blocker', 'ចំណុចរារាំងសំខាន់'],
  ['next blocker', 'ចំណុចរារាំងបន្ទាប់'],
  ['blocker', 'ចំណុចរារាំង'],
  ['delivery timing', 'ពេលវេលាមកដល់'],
  ['lead time', 'ពេលវេលាមកដល់'],
  ['lead-time', 'ពេលវេលាមកដល់'],
  ['safety stock', 'ស្តុកសុវត្ថិភាព'],
  ['stockout risk', 'ហានិភ័យអស់ស្តុក'],
  ['stockout', 'អស់ស្តុក'],
  ['observation ledger', 'បញ្ជីការសង្កេត'],
  ['system timeline', 'បន្ទាត់ពេលវេលាប្រព័ន្ធ'],
  ['risk explorer', 'ផ្ទាំងស្វែងរកហានិភ័យ'],
  ['service blocker map', 'ផែនទីចំណុចរារាំងសេវាកម្ម'],
  ['selected interval', 'ចន្លោះពេលដែលបានជ្រើស'],
  ['current system picture', 'ស្ថានភាពប្រព័ន្ធបច្ចុប្បន្ន'],
  ['analysis details', 'ព័ត៌មានលម្អិតនៃការវិភាគ'],
  ['local data', 'ទិន្នន័យក្នុងម៉ាស៊ីន'],
  ['data folder', 'ថតទិន្នន័យ'],
  ['raw files', 'ឯកសារដើម'],
  ['workspace preferences', 'ចំណូលចិត្តកន្លែងធ្វើការ'],
  ['advanced settings', 'ការកំណត់លម្អិត'],
  ['desktop preferences', 'ចំណូលចិត្តសម្រាប់ desktop'],
  ['analysis profile', 'ទម្រង់វិភាគ'],
  ['exchange rate', 'អត្រាប្ដូរប្រាក់'],
  ['service level', 'កម្រិតភាពមានស្រាប់'],
  ['forecast horizon', 'រយៈពេលព្យាករណ៍'],
  ['smoothing window', 'បង្អួចបន្ថយភាពរញ៉េរញ៉ៃ'],
  ['analysis sample count', 'ចំនួនគំរូវិភាគ'],
  ['sellable', 'អាចលក់បាន'],
  ['coverage', 'ការគ្របដណ្តប់'],
  ['workspace', 'កន្លែងធ្វើការ'],
  ['detail', 'លម្អិត'],
  ['details', 'ព័ត៌មានលម្អិត'],
  ['signal', 'សញ្ញា'],
  ['signals', 'សញ្ញា'],
  ['timeline', 'បន្ទាត់ពេលវេលា'],
  ['service', 'សេវាកម្ម'],
  ['services', 'សេវាកម្ម'],
  ['inventory', 'ស្តុក'],
  ['stock', 'ស្តុក'],
  ['price', 'តម្លៃ'],
  ['risk', 'ហានិភ័យ'],
  ['queue', 'ជួរ'],
  ['priority', 'អាទិភាព'],
  ['priorities', 'អាទិភាព'],
  ['summary', 'សេចក្តីសង្ខេប'],
  ['refresh', 'ផ្ទុកឡើងវិញ'],
  ['loaded', 'បានផ្ទុក'],
  ['saved', 'បានរក្សាទុក'],
  ['failed', 'បរាជ័យ'],
];

const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;

function extractTemplateVariables(template: string): string[] {
  return [...template.matchAll(placeholderPattern)].map((match) => match[1]).sort();
}

function protectPlaceholders(text: string): { text: string; placeholders: string[] } {
  const placeholders: string[] = [];
  const protectedText = text.replace(placeholderPattern, (match) => {
    const token = `__VAR_${placeholders.length}__`;
    placeholders.push(match);
    return token;
  });
  return { text: protectedText, placeholders };
}

function restorePlaceholders(text: string, placeholders: string[]): string {
  return text.replace(/__VAR_(\d+)__/g, (_, index: string) => placeholders[Number(index)] ?? '');
}

function needsSpaceBefore(value: string): boolean {
  return /^[A-Za-z0-9{]/.test(value);
}

function joinKhmer(prefix: string, value: string, suffix = ''): string {
  const lead = needsSpaceBefore(value) ? ' ' : '';
  const tail = suffix ? `${needsSpaceBefore(suffix) ? ' ' : ''}${suffix}` : '';
  return `${prefix}${lead}${value}${tail}`;
}

function normalizeSpacing(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+·\s+/g, ' · ')
    .trim();
}

function localizeKhmerProductWords(text: string): string {
  return text
    .replace(/\bBanji\b/g, 'បញ្ជី')
    .replace(/\bdesktop\b/gi, 'កុំព្យូទ័រ')
    .replace(/\bDesktop\b/g, 'កុំព្យូទ័រ')
    .replace(/([ក-៿])\s+បញ្ជី/g, '$1បញ្ជី')
    .replace(/បញ្ជី\s+([ក-៿])/g, 'បញ្ជី$1')
    .replace(/([ក-៿])\s+កុំព្យូទ័រ/g, '$1កុំព្យូទ័រ')
    .replace(/កុំព្យូទ័រ\s+([ក-៿])/g, 'កុំព្យូទ័រ$1');
}

function applyPhraseTranslations(text: string): string {
  let translated = text;
  const ordered = [...phraseTranslations].sort((left, right) => right[0].length - left[0].length);
  for (const [source, target] of ordered) {
    const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundarySafe = /^[A-Za-z0-9].*[A-Za-z0-9]$/.test(source);
    const pattern = new RegExp(boundarySafe ? `\\b${escapedSource}\\b` : escapedSource, 'gi');
    translated = translated.replace(pattern, target);
  }
  return translated;
}

function translateByPattern(value: string): string | null {
  const patterns: Array<[RegExp, (...captures: string[]) => string]> = [
    [/^Open (.+)$/, (target) => joinKhmer('បើក', translateValueFragment(target))],
    [/^Review (.+)$/, (target) => joinKhmer('ពិនិត្យ', translateValueFragment(target))],
    [/^Create (.+)$/, (target) => joinKhmer('បង្កើត', translateValueFragment(target))],
    [/^Add (.+)$/, (target) => joinKhmer('បន្ថែម', translateValueFragment(target))],
    [/^Edit (.+)$/, (target) => joinKhmer('កែ', translateValueFragment(target))],
    [/^Start (.+)$/, (target) => joinKhmer('ចាប់ផ្តើម', translateValueFragment(target))],
    [/^Show (.+)$/, (target) => joinKhmer('បង្ហាញ', translateValueFragment(target))],
    [/^Hide (.+)$/, (target) => joinKhmer('លាក់', translateValueFragment(target))],
    [/^Expand (.+)$/, (target) => joinKhmer('ពង្រីក', translateValueFragment(target))],
    [/^Collapse (.+)$/, (target) => joinKhmer('បង្រួម', translateValueFragment(target))],
    [/^No (.+) yet\.?$/, (target) => `មិនទាន់មាន${needsSpaceBefore(target) ? ' ' : ''}${translateValueFragment(target)}នៅឡើយទេ។`],
    [/^No (.+) available\.?$/, (target) => `មិនទាន់មាន${needsSpaceBefore(target) ? ' ' : ''}${translateValueFragment(target)}ទេ។`],
    [/^Loading (.+)…$/, (target) => joinKhmer('កំពុងផ្ទុក', translateValueFragment(target), '…')],
    [/^Page \{current\} of \{total\}$/, () => 'ទំព័រ {current} នៃ {total}'],
    [/^\{count\} more waiting in queue\.$/, () => 'នៅមាន {count} ទៀតកំពុងរង់ចាំក្នុងជួរ។'],
    [/^\{count\} linked SKU\{suffix\}$/, () => 'SKU ដែលភ្ជាប់ {count} {suffix}'],
    [/^\{count\} SKU row\{suffix\} included in this update\.$/, () => 'បានបញ្ចូលជួរ SKU ចំនួន {count} {suffix} ក្នុងការអាប់ដេតនេះ។'],
    [/^\{count\} signal\{suffix\} added$/, () => 'បានបន្ថែមសញ្ញា {count} {suffix}'],
    [/^Current arrival window \{window\}\.$/, () => 'រយៈពេលមកដល់បច្ចុប្បន្ន {window}។'],
    [/^Real-world update \{days\}d ago$/, () => 'ការអាប់ដេតពិត {days} ថ្ងៃមុន'],
    [/^Likely range \{low\}-\{high\}$/, () => 'ចន្លោះដែលទំនង {low}-{high}'],
    [/^\{count\} units$/, () => '{count} ឯកតា'],
  ];

  for (const [pattern, formatter] of patterns) {
    const match = value.match(pattern);
    if (match) {
      return formatter(...match.slice(1));
    }
  }
  return null;
}

function translateValueFragment(value: string): string {
  const direct = exactValueTranslations[value];
  if (direct) {
    return direct;
  }

  const patternTranslation = translateByPattern(value);
  if (patternTranslation) {
    return patternTranslation;
  }

  const { text, placeholders } = protectPlaceholders(value);
  const translated = normalizeSpacing(applyPhraseTranslations(text));
  return restorePlaceholders(translated, placeholders);
}

function translateValue(key: TranslationKey, englishValue: string): string {
  const directKey = directKeyTranslations[key];
  if (directKey) {
    return localizeKhmerProductWords(directKey);
  }

  const directValue = exactValueTranslations[englishValue];
  if (directValue) {
    return localizeKhmerProductWords(directValue);
  }

  const patternTranslation = translateByPattern(englishValue);
  if (patternTranslation) {
    return localizeKhmerProductWords(patternTranslation);
  }

  return localizeKhmerProductWords(translateValueFragment(englishValue));
}

function buildKmUiCopy(): Record<TranslationKey, string> {
  const entries = Object.entries(activeEnUiCopy).map(([key, englishValue]) => {
    const translated = translateValue(key as TranslationKey, englishValue);
    const englishVariables = extractTemplateVariables(englishValue);
    const khmerVariables = extractTemplateVariables(translated);
    if (englishVariables.join('|') !== khmerVariables.join('|')) {
      throw new Error(`Khmer placeholder mismatch for ${key}`);
    }
    return [key, translated];
  });

  return Object.fromEntries(entries) as Record<TranslationKey, string>;
}

export const kmUiCopy = buildKmUiCopy();
