# មគ្គុទ្ទេសក៍អ្នកប្រើប្រាស់ បញ្ជី

បញ្ជី គឺជា app ស្តុកលើកុំព្យូទ័រ ដែលរក្សាទិន្នន័យក្នុងម៉ាស៊ីន។ វាជួយអ្នករក្សាកាតាឡុក កត់ត្រាការផ្លាស់ប្តូរពិត ពិនិត្យការងារដែលត្រូវធ្វើ និងមើលសញ្ញាអាជីវកម្មក្នុង app តែមួយ។

## មាតិកា

- [បញ្ជី សម្រាប់អ្វី](#បញ្ជី-សម្រាប់អ្វី)
- [លំហូរការងារប្រចាំថ្ងៃ](#លំហូរការងារប្រចាំថ្ងៃ)
- [ការរុករក](#ការរុករក)
- [Home](#home)
- [Work](#work)
- [Catalog](#catalog)
- [Insights](#insights)
- [History](#history)
- [Settings និង Help](#settings-និង-help)
- [សំណួរញឹកញាប់](#សំណួរញឹកញាប់)

## បញ្ជី សម្រាប់អ្វី

បញ្ជី សម្រាប់ក្រុមដែលចង់បាន command app ស្តុកលើម៉ាស៊ីនតែមួយ។ វាសមស្របសម្រាប់៖

- រក្សា SKU និងសេវាកម្មទាំង active និង archived
- កត់ត្រា stock count, customer order, sale, supplier order, receipt, និង custom update
- ពិនិត្យការងារអតិថិជន និងអ្នកផ្គត់ផ្គង់ដែលត្រូវយកចិត្តទុកដាក់
- មើលសញ្ញា demand, capacity, money, និង explanation ពីទិន្នន័យក្នុងម៉ាស៊ីន
- រក្សាប្រវត្តិ update ដោយមិនចាំបាច់ប្រើ hosted back office

បញ្ជី មិនមែនជា ERP ពេញលេញ, accounting system, ឬ workflow builder ទូទៅទេ។

## លំហូរការងារប្រចាំថ្ងៃ

លំដាប់ធម្មតា៖

1. ចាប់ផ្តើមពី **Home**។
2. បើក **Work** ដើម្បីពិនិត្យ queue, capture, និង intake work។
3. ប្រើ **Work / Capture** នៅពេលមានអ្វីពិតបានផ្លាស់ប្តូរ។
4. បើក **Catalog** នៅពេលត្រូវកែ item, archive, ឬ automation exposure។
5. បើក **Insights** សម្រាប់ pressure, money, និង explanation views។
6. ប្រើ **History** ពី command palette ឬ Settings ដើម្បីមើល report, edit, ឬ delete។
7. ប្រើ **Settings** សម្រាប់ preferences, local data, planning, automation connection, help, benchmarks, និង danger zone។

## ការរុករក

Sidebar មានគោលដៅសំខាន់តែប៉ុន្មាន៖

- **Home**៖ ចំណុចចាប់ផ្តើម និង command home
- **Work**៖ queue, capture, និង automation intake
- **Catalog**៖ active items, archived items, detail, edit, និង automation exposure
- **Insights**៖ Pressure, Money, និង Explain modes
- **Settings**៖ system, support, local data, automation connection, និង maintenance

អ្វីដែលបានផ្លាស់ទី៖

- **History** អាចបើកតាម command palette, Settings, និង report context។
- **Archived catalog** នៅក្នុង Catalog។
- **Help** នៅក្នុង Settings `/settings/help`។
- **Automation intake** នៅក្នុង Work; exposure នៅក្នុង Catalog; Telegram connection នៅក្នុង Settings។

URL top-level ចាស់ៗមិនគាំទ្រទៀតទេ។

## Home

Home គឺជាផ្ទៃចាប់ផ្តើម។ វាមានសកម្មភាពសំខាន់ 4៖

- **Continue Work**
- **Capture Update**
- **Open Catalog**
- **Open Insights**

សកម្មភាព 4 នេះបង្ហាញជា grid 2x2 នៅកណ្ដាល ដូច layout របស់ Capture hub។

ប្រើ Home នៅពេលអ្នកមិនប្រាកដថាត្រូវចាប់ផ្តើមពីណា។

## Work

Work គឺជាកន្លែង “តើអ្វីត្រូវយកចិត្តទុកដាក់ឥឡូវនេះ?”។

ប្រើ Work ដើម្បី៖

- ពិនិត្យ supplier queue ដែលជាលំនាំដើម
- ប្ដូរទៅ customer work
- បើក task drawer ហើយទៅ detail ឬ Capture lane ដែលត្រូវគ្នា
- ពិនិត្យ Telegram/customer intake ក្នុង Intake section
- កត់ត្រាការផ្លាស់ប្តូរពិតតាម Capture hub

ការគ្រប់គ្រងសំខាន់៖

- **Queue / Capture / Intake** ប្ដូររវាងការសម្រេចចិត្ត, update authoring, និង automation intake។
- **Supplier / Customer** ប្ដូរ queue family។
- **Task filters**, **Search**, និង **Supplier filter** បង្រួមអ្វីដែលមើលឃើញ។

Work Queue ជួយអ្នកជ្រើសការងារ។ Work Capture កត់ត្រាភស្តុតាងថ្មី។

ប្រើ Capture នៅពេល៖

- stock count ផ្លាស់ប្តូរ
- មាន customer order ថ្មី
- មាន immediate sale
- supplier order ត្រូវបានបង្កើត ឬកែ
- receipt មកដល់លើ supplier ticket ដែលមានស្រាប់
- ព្រឹត្តិការណ៍មួយត្រូវការ custom combined flow

Canonical lanes៖

- `/work/capture/stock-count`
- `/work/capture/customer-order`
- `/work/capture/immediate-sale`
- `/work/capture/supplier-order`
- `/work/capture/custom`

Customer Order និង Supplier Order នឹងសួរថា អ្នកកំពុងបង្កើត ticket ថ្មី ឬ update ticket ដែលមានស្រាប់។ Supplier receipt នៅក្នុង Supplier Order ពេល update supplier ticket។

Draft, resume/delete, save semantics, និង ticket-backed authoring នៅដដែល។

## Catalog

Catalog គឺជា source of truth សម្រាប់ SKU និង service definitions។

ប្រើ Catalog ដើម្បី៖

- បង្កើត ឬកែ SKU/service
- ស្វែងរក និង filter active sellables
- បើក detail pages
- archive ឬ unarchive items
- មើល archived items ជា `status=archived`
- គ្រប់គ្រង automation exposure

Archive មិនមែន delete ទេ។ Archived items លាក់ពី active work ប៉ុន្តែនៅរក្សាទុកសម្រាប់ប្រវត្តិ ហើយអាច restore បាន។

## Insights

Insights គឺជា workspace តែមួយសម្រាប់អានសញ្ញាអាជីវកម្ម។

Modes៖

- **Pressure**៖ demand, capacity, timing, price pressure, comparison, និង prioritization
- **Money**៖ sales, gross profit signals, capital tied up, margin pressure, និង leakage
- **Explain**៖ ពន្យល់ថា ហេតុអ្វី បញ្ជី បង្ហាញ signal មួយ

Insights សម្រាប់អាន និងសម្រេចចិត្ត។ វាមិនមែនជា data-entry workflow ទេ។

## History

History គឺជាប្រវត្តិ saved update។ វាជា maintenance/context surface មិនមែនជា destination នៅ sidebar ទេ។

ប្រើ History ដើម្បី៖

- ស្វែងរក saved reports
- មើល heatmap ឬ all-reports list
- បើក report
- edit report តាម Capture flow
- delete report បន្ទាប់ពី confirmation

History ពន្យល់អ្វីដែលបានរក្សាទុក។ Work ពន្យល់អ្វីដែលត្រូវធ្វើឥឡូវនេះ។

## Settings និង Help

Settings រួមមាន៖

- workspace preferences
- interface visibility controls
- local data, backup, restore, និង clear-data actions
- local planning parameters
- Telegram automation connection និង test-message state
- Help នៅ `/settings/help`
- benchmarks
- danger zone
- credits

Help mirror មគ្គុទ្ទេសក៍នេះ ហើយអាចស្វែងរកក្នុង app បាន។

## សំណួរញឹកញាប់

### Home និង Work ខុសគ្នាយ៉ាងដូចម្តេច?

Home គឺជា command entry point។ Work គឺជា queue, capture, និង intake workspace។

### Signal pages ចាស់ៗ ទៅណា?

វាបានក្លាយជា modes នៅក្នុង **Insights**៖ Pressure, Money, និង Explain។

### Automations ទៅណា?

Automation intake ទៅ **Work**។ Exposure controls ទៅ **Catalog**។ Telegram connection និង test-message controls ទៅ **Settings**។

### History នៅឯណា?

History នៅក្នុង **Settings** និង report actions។

### Archive ទៅណា?

Archive ឥឡូវនេះគឺ archived status នៅក្នុង **Catalog**។

### តើ link ចាស់ៗនៅដំណើរការទេ?

ទេ។ ប្រើ canonical routes៖ Home, Work, Catalog, Insights, និង Settings។
