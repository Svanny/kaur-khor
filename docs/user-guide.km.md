# មគ្គុទ្ទេសក៍អ្នកប្រើប្រាស់ បញ្ជី

បញ្ជី គឺជា app ស្តុកលើកុំព្យូទ័រ ដែលរក្សាទិន្នន័យក្នុងម៉ាស៊ីន។ វាជួយអ្នករក្សាកាតាឡុក កត់ត្រាការផ្លាស់ប្តូរពិត ពិនិត្យការងារដែលត្រូវធ្វើ និងមើលសញ្ញាអាជីវកម្មក្នុង app តែមួយ។

## មាតិកា

- [បញ្ជី សម្រាប់អ្វី](#បញ្ជី-សម្រាប់អ្វី)
- [លំហូរការងារប្រចាំថ្ងៃ](#លំហូរការងារប្រចាំថ្ងៃ)
- [ការរុករក](#ការរុករក)
- [Home](#home)
- [Work](#work)
- [Queue](#queue)
- [Capture](#capture)
- [Intake](#intake)
- [Catalog](#catalog)
- [Insights](#insights)
- [Pressure](#pressure)
- [Money](#money)
- [Explain](#explain)
- [Automations](#automations)
- [History](#history)
- [Settings](#settings)
- [First Useful Workflow](#first-useful-workflow)
- [Glossary](#glossary)
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

នៅពេលចូល Settings ពី route ផ្សេងក្នុង app, **Back to app** ត្រឡប់ទៅ route ដើមនោះ រួមទាំង query filters មិនមែនតែងតែទៅ Home ទេ។

URL top-level ចាស់ៗមិនគាំទ្រទៀតទេ។

## Home

Home គឺជាផ្ទៃចាប់ផ្តើម។ វាអាចបង្ហាញសកម្មភាពសំខាន់រហូតដល់ 4៖

- **Start Work**
- **Capture Update**
- **Open Catalog**
- **Open Insights**

សកម្មភាពដែលអាចប្រើបាន បង្ហាញជា grid នៅកណ្ដាល ដូច layout របស់ Capture hub។ នៅពេលមានសកម្មភាព 3 ដែលអាចមើលឃើញ Home បង្ហាញវាជាជួរតែមួយ ជំនួសឲ្យទុកចន្លោះ card ទី 4 ទទេ។ banji លាក់សកម្មភាពដែលមិនទាន់អាចប្រើបាន ជំនួសឲ្យការបង្ហាញ card disabled។

ប្រើ Home នៅពេលអ្នកមិនប្រាកដថាត្រូវចាប់ផ្តើមពីណា។

## Work

Work គឺជា workspace ប្រចាំថ្ងៃសម្រាប់ប្រតិបត្តិការ។ វាបែងចែកជា Queue សម្រាប់សម្រេចថាអ្វីត្រូវយកចិត្តទុកដាក់, Capture សម្រាប់រក្សាទុកការផ្លាស់ប្តូរពិត, និង Intake សម្រាប់ពិនិត្យ request ពី automation/customer។ ប្រើ Work នៅពេលសំណួរគឺត្រូវពិនិត្យ កត់ត្រា ឬ promote អ្វីឥឡូវនេះ។

## Queue

Queue គឺជា decision surface សម្រាប់ supplier និង customer work។ Operator ប្រើវាដើម្បី scan task status, បើក drawer, filter តាម supplier ឬ task state, ហើយទៅ item ឬ capture lane ដែលត្រូវ។ Queue មិន save evidence ថ្មីដោយខ្លួនឯងទេ; វាជួយជ្រើស next action ពី catalog, ticket, stock, និង timing signals ដែលមានស្រាប់។

## Capture

Capture គឺជា update-authoring workflow នៅក្នុង Work។ វាបម្លែងព្រឹត្តិការណ៍ពិតទៅជា local evidence ដែល queue, Catalog detail, Pressure, Money, Explain, និង History អាចអានពេលក្រោយ។ ប្រើ Capture នៅពេល stock, orders, receipts, prices, flags, rankings, notes, ឬ delivery details ផ្លាស់ប្តូរ។

សម្រាប់ ticket-backed lanes, បញ្ជី បើកលំហូរ new ticket ដោយផ្ទាល់ នៅពេលគ្មាន meaningful saved draft ឬ editable ticket។ វាសួរ resume, start new, ឬ edit/update តែនៅពេលជម្រើសនោះប៉ះពាល់ការងារពិត។ Mode-only placeholders ត្រូវបានលុប មិនបង្ហាញជា saved drafts ទេ។

### ថ្លៃដឹកជញ្ជូន {#record-update-delivery-fee}

Delivery fee records the charge and payer for a customer order or receipt summary នៅពេល delivery handling គឺជា enabled. វា affects the customer-facing total and can matter for margin review. Check it មុនពេល saving so totals match the actual customer agreement.

### កំណត់សម្គាល់ {#record-update-notes}

Notes capture operator context that structured fields cannot express. They គឺជា useful for explaining unusual counts, customer requests, supplier promises, or manual corrections. Keep notes factual ព្រោះ they appear later in History, detail pages, and analysis evidence.

### ពេលសង្កេត {#record-update-observed-at}

Observed at គឺជា the timestamp for នៅពេល the real-world event happened. វា can differ from the time you enter it. Use the actual event time នៅពេល backfilling counts, receipts, or orders so timelines and analysis intervals stay accurate.

### ព័ត៌មានលម្អិតលំដាប់ {#record-update-ranking-details}

Ranking details explain an optional ordered list, such as top services or retail items. The order becomes evidence about relative demand or operator judgment. ប្រើវា only នៅពេល the ranking reflects what happened, not as a general preference list.

### លំដាប់ {#record-update-rankings}

Rankings let you record which services or products were most relevant in the update. They help បញ្ជី learn demand patterns នៅពេល exact quantities គឺជា incomplete. Use them for directional evidence, then rely on counts and tickets for precise units.

### បរិបទលំនាំលក់ {#record-update-regime-context}

Regime context lets the operator label the broader demand environment, such as spike, lull, promo, correction, or stockout-constrained. វា helps Explain interpret unusual intervals. ប្រើវា នៅពេល the event happened under conditions that normal numbers do not capture.

### តម្លៃលក់រាយ {#record-update-retail-price}

Retail price records a changed customer-facing product price for SKUs sold directly. វា affects future sale entry, automation quotes, Money, and margin analysis. ប្រើវា នៅពេល the sell price changed; leave it unchanged នៅពេល only stock count changed.

### ការពិនិត្យ {#record-update-review}

Review គឺជា the final confirmation panel មុនពេល saving a Record Update. វា summarizes what will be written to local history and what downstream surfaces may read. ប្រើវា to catch wrong quantities, timestamps, flags, prices, notes, or ticket targets.

### សញ្ញាសេវាកម្ម {#record-update-service-flags}

Service flags record service-level price changes or blocked/stockout events. They គឺជា evidence for availability, service detail, automation exposure, and analysis. Use them នៅពេល a service condition changed even if no SKU count changed.

### ជំហានសេវាកម្ម {#record-update-service-step}

The service step captures service-level signals during an update. វា lets you add service price changes, blocked states, or stockout flags tied to service delivery. ប្រើវា នៅពេល customer-facing service availability changed.

### សញ្ញាទំនិញ {#record-update-sku-flags}

SKU flags record events such as blocked availability or stockout-constrained behavior for stock items. They explain why demand may not convert into sales even នៅពេល customers wanted the item. Use flags sparingly and only for real conditions.

### ថ្លៃដើមស្តុក {#record-update-stock-cost}

Stock cost records a changed supplier/unit cost for SKUs. វា affects margin, capital, and Money calculations. ប្រើវា នៅពេល replacement cost or known purchase cost changed; do not use it as a sale price field.

### ចំនួនស្តុក {#record-update-stock-count}

Stock count គឺជា the current on-hand quantity for each SKU at the observed time. វា គឺជា one of the strongest pieces of evidence in បញ្ជី ព្រោះ pressure, availability, service capacity, and Money all depend on it. Count carefully and filter by supplier នៅពេល needed.

## Intake

Intake គឺជា customer-request review surface សម្រាប់ automation-assisted work។ វាបង្ហាញ parsed customer messages, quoted totals, confidence, exceptions, និង review state មុន request ក្លាយជា queue ឬ ticket work ធម្មតា។ ប្រើ Intake ដើម្បី confirm customer intent, កែ catalog data ខ្វះ, ហើយ promote តែ request ស្អាត។

### អតិថិជន {#automation-intake-customer}

Customer column បង្ហាញ person ឬ account ដែល បញ្ជី inferred ពី intake conversation។ ពិនិត្យវា នៅពេល name, phone, channel, ឬ conversation identity មិនពេញលេញ។ Customer metadata គួរត្រូវបានរក្សាទុកជា structured ticket party data មិនមែនតែ notes ទេ។

### សំណើ {#automation-intake-request}

Request column សង្ខេបអ្វីដែល customer កំពុងស្នើ មុនពេល intake ក្លាយជា customer ticket។ វាអាចមាន matched catalog items, quantities, availability questions, ឬ free-text request ដែល operator ត្រូវបកស្រាយបន្ថែម។

### តម្លៃសរុបដែលបានដាក់សម្រង់ {#automation-intake-quoted-total}

Quoted total គឺជា estimated customer-facing amount ពី matched catalog data។ វានៅ pending នៅពេល បញ្ជី មិនអាច match request ទៅ priced SKUs ឬ services ដោយជឿជាក់។

### ស្ថានភាព {#automation-intake-state}

State ពន្យល់ថា intake ស្ថិតនៅជំហានណានៃ operator workflow។ Review state ជាទូទៅមានន័យថា បញ្ជី មាន context គ្រប់គ្រាន់សម្រាប់បង្ហាញ request ប៉ុន្តែមិនទាន់មាន certainty គ្រប់គ្រាន់សម្រាប់ create ឬ update ticket ដោយគ្មានមនុស្សពិនិត្យ។

### ពេលបង្កើត និងអាប់ដេត {#automation-intake-created-updated}

Created / updated បង្ហាញពេល intake កើតឡើងដំបូង និងពេលវាផ្លាស់ប្តូរចុងក្រោយ។ ប្រើវាដើម្បីបំបែក fresh customer messages ពី older requests ដែលកំពុងរង់ចាំ follow-up។

### ការសន្ទនាអតិថិជន {#automation-exception-customer-conversation}

Customer / conversation កំណត់ថា customer thread មួយណាបង្កើត exception។ ប្រើវាដើម្បីបើក context មុនសម្រេចថា issue គឺ missing catalog item, unclear request, ឬ duplicate ticket។

### បញ្ហា {#automation-exception-issue}

Issue ពន្យល់ថាហេតុអ្វី បញ្ជី បញ្ឈប់ intake flow ដើម្បីឱ្យ operator review។ ហេតុផលធម្មតា រួមមាន unclear item matches, missing prices, ambiguous quantities, ឬ messages ដែលមិន map ទៅ workflow ដែលគាំទ្រ។

### សារចុងក្រោយ {#automation-exception-last-message}

Last message បង្ហាញ customer text ចុងក្រោយដែលបង្កើត exception។ វាខ្លីដើម្បីឱ្យ table ងាយ scan; បើក intake សម្រាប់ conversation context ពេញលេញ។

### ទំនុកចិត្ត {#automation-exception-confidence}

Confidence គឺជា certainty របស់ បញ្ជី លើ inferred request ឬ match។ Low confidence គួរឱ្យ operator ពិនិត្យ source message, catalog aliases, និង ticket target មុន commit work។

### ការទទួលសំណើផ្ទាល់ {#automation-live-intake}

Live intake គឺជា the table of customer requests captured from automation មុនពេល they become normal Work tickets. វា បង្ហាញ who asked, what was parsed, quoted totals, state, and timestamps. ប្រើវា to review and promote requests that គឺជា ready, or investigate ones that គឺជា still ambiguous.

### ត្រូវការពិនិត្យ {#automation-needs-review}

Needs review lists automation messages បញ្ជី could not safely convert into clean work. The issue and confidence columns explain why the request stopped. ប្រើផ្នែកនេះ section to fix catalog aliases, missing prices, unclear quantities, or customer identity មុនពេល creating tickets.

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

Money fields ក្នុង Catalog និង Capture បង្ហាញនិមិត្តសញ្ញារូបិយប័ណ្ណសកម្ម (`$` ឬ `៛`) នៅក្នុង input។ វាយតែចំនួនលេខប៉ុណ្ណោះ; សញ្ញាក្បៀស និងនិមិត្តសញ្ញារូបិយប័ណ្ណ គ្រាន់តែជាជំនួយបង្ហាញ ហើយ បញ្ជី រក្សាទុកតម្លៃខាងក្រោយតាមរូបិយប័ណ្ណ workspace ដែលបានជ្រើស។

### ធ្វើឥឡូវនេះ {#catalog-detail-act-now}

Act now គឺជា the detail-page action summary for a SKU. វា condenses current demand, stock, supplier pipeline, and timing into a suggested next move. ប្រើវា as a starting point, then check the rail rationale and evidence មុនពេល committing to an order or catalog change.

### តម្រូវការអតិថិជន {#catalog-detail-customer-demand}

Customer demand summarizes open commitments and realized customer flow linked to the SKU. វា helps explain why an item គឺជា under pressure even នៅពេល the current stock count looks acceptable. ប្រើវា មុនពេល deciding whether to reserve stock, reorder, or change exposure.

### ការពិនិត្យបន្ទាប់ {#catalog-detail-next-touch}

Next touch គឺជា the recommended date or reason to revisit the SKU. វា គឺជា based on current stock, pipeline, timing, and latest observation age. ប្រើវា to schedule follow-up នៅពេល immediate action គឺជា not required but the item គួរ not be ignored.

### ខ្សែការងារបើក {#catalog-detail-open-pipeline}

Open pipeline lists supplier orders and receipts that may affect the SKU. វា បង្ហាញ whether relief គឺជា already expected or whether the item has no meaningful inbound support. ប្រើវា មុនពេល placing duplicate supplier orders.

### ចន្លោះពេលដែលបានជ្រើស {#catalog-detail-selected-interval}

Selected interval explains the period chosen in the SKU chart or timeline. វា បង្ហាញ demand, receipts, adjustments, regime, and notes for that slice. ប្រើវា to understand why one chart segment changed instead of reading the current headline alone.

### អ្នកផ្គត់ផ្គង់ {#catalog-detail-supplier}

Supplier identifies the vendor attached to the SKU. វា matters ព្រោះ supplier filters, work queues, lead-time evidence, and open pipeline all use this assignment. Fix it in the editor នៅពេល supplier work appears under the wrong vendor.

### ភាពមានស្រាប់សេវាកម្ម {#catalog-service-availability}

Service availability describes whether the service can be offered from current linked-SKU capacity and catalog setup. វា គឺជា not just the service price; a service can be blocked by missing or constrained components. ប្រើវា មុនពេល exposing the service to customers.

### ផលប៉ះពាល់ភាពពឹងផ្អែកសេវាកម្ម {#catalog-service-dependency-impact}

Dependency impact បង្ហាញ which linked SKUs គឺជា limiting or supporting a service. វា explains whether a service shortage comes from one binding SKU, several weak SKUs, or no clear blocker. ប្រើវា នៅពេល the service headline looks wrong or too broad.

### ព័ត៌មានលម្អិតកម្មវិធីកែសេវាកម្ម {#catalog-service-editor-details}

Service details define the stable identity of a service: name, description, and image. បញ្ជី បង្កើត internal service ID នៅពេលបង្កើត service ថ្មី ហើយរក្សាវាឲ្យ stable បន្ទាប់ពីនោះ។ These fields affect search, detail pages, automation matching, and customer-facing labels. Keep them clear មុនពេល linking SKUs or exposing the service.

អ្នកអាច add ឬ replace image ដោយ choose file, drag file ទៅលើ picture field, ឬ paste image ពី page ឬ field clipboard។ PNG, JPEG, និង WebP ត្រូវបានទទួលយក។

### ទំនិញដែលភ្ជាប់ {#catalog-service-editor-linked-skus}

Linked SKUs define what stock a service consumes or depends on. ផ្នែកនេះ គឺជា the core setup for service capacity, bottleneck analysis, and automation availability. ប្រើផ្នែកនេះ section នៅពេល a service appears available or blocked for the wrong reason.

### ការកំណត់តម្លៃសេវាកម្ម {#catalog-service-editor-pricing}

Service pricing គឺជា the customer-facing price for one service delivery. វាជា required មុនពេល create ឬ save service ហើយ feeds Money, automation quotes, service detail, and customer tickets. Update it នៅពេល the sell price changes; use Record Update for observed price-change evidence if you need history.

### ខ្សែពេលភស្តុតាងសេវាកម្ម {#catalog-service-evidence-timeline}

The service evidence timeline lists saved updates that explain the service's current signal. វា may include price changes, linked demand, notes, and stock-linked dependency events. ប្រើវា to audit why the service detail page changed.

### ខ្សែស្ថានភាពប្រតិបត្តិការសេវាកម្ម {#catalog-service-operational-ribbon}

The service operational ribbon គឺជា the compact row of key service metrics. វា summarizes availability, dependency pressure, confidence, and other status values so users can scan មុនពេល reading detail panels. ប្រើវា to choose which panel needs attention first.

### ផលប៉ះពាល់ភាពពឹងផ្អែកទំនិញ {#catalog-sku-dependency-impact}

SKU dependency impact បង្ហាញ which services rely on this SKU and how severely they គឺជា affected. វា helps explain why a simple stock item can create service pressure. ប្រើវា មុនពេល hiding, archiving, or delaying replenishment for a shared component.

### ព័ត៌មានលម្អិតកម្មវិធីកែទំនិញ {#catalog-sku-editor-details}

SKU details define the stock item's identity: name, supplier, description, and image. Name និង supplier ជា required មុនពេល create ឬ save SKU។ These fields affect search, supplier queues, automation exposure, and detail-page interpretation. Fix details here នៅពេល the wrong item appears in work or customer-facing surfaces.

អ្នកអាច add ឬ replace image ដោយ choose file, drag file ទៅលើ picture field, ឬ paste image ពី page ឬ field clipboard។ PNG, JPEG, និង WebP ត្រូវបានទទួលយក។

ការរក្សាទុកការផ្លាស់ប្តូរនៅក្នុង SKU editor នឹងរក្សាអ្នកនៅលើ editor ដើម្បីបន្តពិនិត្យ draft។ ប្រើ **Details** ដើម្បីចេញពី editor ហើយបើក SKU detail page។ បើមានការផ្លាស់ប្តូរមិនទាន់រក្សាទុក navigation links រួមទាំង tooltip **More** links នឹងសួរមុនពេលបោះបង់ draft បច្ចុប្បន្ន។

### ការរៀបចំផែនការទំនិញ {#catalog-sku-editor-planning}

SKU planning inputs describe lead-time expectations and variability for replenishment. Lead-time mean និង uncertainty days ឬ variability preset ជា required មុនពេល create ឬ save SKU។ They guide reorder timing, pressure, and Explain lead-time risk. Use measured supplier behavior នៅពេល available; guesses គួរ be conservative and revisited បន្ទាប់ពី receipts arrive.

### ការកំណត់តម្លៃទំនិញ {#catalog-sku-editor-pricing}

SKU pricing includes required unit cost and optional customer-facing product price. Cost affects margin and capital calculations; product price affects retail sale, automation quote, and Money views. Keep both current នៅពេល supplier cost or sell price changes.

### លក់ជាទំនិញ {#catalog-sku-editor-sell-as-product}

Sell as product controls whether a SKU can be sold directly to customers, not only used as a service dependency. Enable it only នៅពេល the SKU has a valid product price and គួរ appear in retail/customer-facing flows.

### ខ្សែពេលភស្តុតាងទំនិញ {#catalog-sku-evidence-timeline}

The SKU evidence timeline lists saved updates that shaped the current SKU signal. វា can include counts, costs, retail price changes, orders, receipts, flags, and notes. ប្រើវា to audit the detail page មុនពេល correcting the catalog or history.

### សញ្ញាសំខាន់របស់ទំនិញ {#catalog-sku-hero-signal}

The SKU hero signal គឺជា the large top-line operational statement on the detail page. វា translates current stock, demand, pipeline, and timing into a human-readable status. ប្រើវា for quick orientation, then inspect the ribbon and rail for causes.

### ខ្សែស្ថានភាពប្រតិបត្តិការទំនិញ {#catalog-sku-operational-ribbon}

The SKU operational ribbon គឺជា the compact metric strip below the hero. វា surfaces key quantities such as cover, pipeline, demand, next receipt, or confidence depending on available data. ប្រើវា to scan the item មុនពេល opening deeper panels.

### បញ្ជីតារាង {#trading-chart-ledger}

The trading chart ledger គឺជា the detail chart surface for SKU, service, or analysis signals. វា combines timeline controls, indicators, selected interval behavior, and saved evidence overlays. ប្រើវា នៅពេល you need to inspect how a headline changed over time.

Dense overlay evidence ដូចជា supplier orders, receipts, ឬ repeated regime markers អាច cluster ជា timeline marker មួយ។ Select marker នោះ ដើម្បី inspect latest interval ក្នុង cluster នោះ។

## Insights

Insights គឺជា entry point សម្រាប់ operating signals។ Subpages របស់វាគឺ Pressure, Money, និង Explain។ ប្រើ section នេះដើម្បីជ្រើស lens ដែលត្រូវនឹងសំណួរ៖ operational urgency, financial quality, ឬ evidence-level explanation។

នៅពេល custom time range កំពុង active នៅក្នុង Pressure, Money, ឬ Explain-adjacent views, range menu បង្ហាញ custom range edit button។ Edit button លាក់នៅពេល preset range active ដើម្បីកុំឲ្យ menu បង្ហាញថាមាន custom range រួចហើយ។

## Pressure

Pressure គឺជា operational urgency subpage។ វាប្រៀបធៀប demand, available capacity, supplier pipeline, timing, confidence, និង price/margin context ដើម្បីជួយ operator សម្រេចថាអ្វីត្រូវយកចិត្តទុកដាក់ឥឡូវនេះ។ ប្រើ Pressure សម្រាប់ prioritization មុន edit records ឬ place supplier work។

### ប្រាក់ចំណេញដែលក្រុមបានរារាំង {#pressure-band-blocked-profit}

Blocked profit contains items with demand or earning potential that cannot convert ព្រោះ stock, timing, or capacity គឺជា in the way. ប្រើផ្នែកនេះ band to find money you may recover by unblocking supply, fixing service dependencies, or correcting availability.

### អន្ទាក់សាច់ប្រាក់របស់ក្រុម {#pressure-band-cash-traps}

Cash traps គឺជា items where stock or capital គឺជា present but operational movement គឺជា weak. They can look safe ព្រោះ they គឺជា not stockouts, yet still waste working capital. ប្រើផ្នែកនេះ band to review pricing, exposure, ordering habits, or archive candidates.

### អ្នកឈ្នះរបស់ក្រុម {#pressure-band-winners}

Winners គឺជា items with useful demand or performance that គួរ be protected. They may need replenishment, exposure, or attention ព្រោះ losing them would hurt service or sales. ប្រើផ្នែកនេះ band to avoid focusing only on emergencies.

### និន្នាការតម្រូវការរបស់ផ្ទាំង {#pressure-board-demand-trend}

Demand trend បង្ហាញ whether recent demand គឺជា rising, falling, stable, or too sparse to trust. វា helps distinguish a temporary spike from a persistent pattern. ប្រើវា with support and pipeline columns មុនពេល changing reorder behavior.

### ធាតុរបស់ផ្ទាំង {#pressure-board-item}

Item identifies the SKU or service in the demand/capacity board. ប្រើវា to open the detail page នៅពេល a row needs action. For services, remember the visible pressure may come from linked SKUs rather than the service record itself.

### ការគាំទ្រខ្សែការងាររបស់ផ្ទាំង {#pressure-board-pipeline-support}

Pipeline support បង្ហាញ whether open supplier orders or expected receipts can cover the risk. Strong support មានន័យថា relief may already be in motion; weak support មានន័យថា demand may outrun supply. ប្រើវា មុនពេល creating or chasing supplier work.

### ប្រាក់ចំណេញតាមតម្លៃរបស់ផ្ទាំង {#pressure-board-price-margin}

Price / margin បង្ហាញ whether pricing or profitability គឺជា part of the pressure story. វា can point to underpriced items, margin changes, or revenue opportunity. ប្រើវា នៅពេល demand គឺជា present but the recommended move គឺជា not simply reorder stock.

### ស្ថានភាពរបស់ផ្ទាំង {#pressure-board-status}

Status គឺជា the row's operational classification in the demand/capacity board. វា summarizes the pattern បន្ទាប់ពី considering demand, capacity, support, pipeline, and price/margin. ប្រើវា for scanning, then read the neighboring columns for cause.

### ការគាំទ្ររបស់ផ្ទាំង {#pressure-board-support}

Support describes available capacity or linked inventory that helps satisfy demand. For SKUs, this គឺជា usually stock coverage; for services, it may be the weakest linked SKU. ប្រើវា to see whether the item គឺជា supported enough to keep selling.

### ក្រុមសញ្ញាសាច់ប្រាក់ {#pressure-cash-signal-bands}

Cash signal bands group pressure items by money-related action type. They show where demand, profit, and capital pressure overlap. Use them នៅពេល operational urgency and cash decisions need to be considered together.

### ទំនុកចិត្ត {#pressure-confidence}

Confidence tells how much trust បញ្ជី has in the pressure signal. វា reflects evidence freshness, coverage, and model stability. Low confidence មានន័យថា capture better data or inspect history មុនពេល making a high-cost decision.

### ផ្ទាំងតម្រូវការ និងសមត្ថភាព {#pressure-demand-capacity-board}

The demand/capacity board គឺជា the main Pressure table for comparing what customers may need against what the operation can supply. វា combines demand trend, support, pipeline, price/margin, and status. ប្រើវា to decide which items need immediate work.

### សកម្មភាព {#pressure-move-action}

Action គឺជា the practical next step for a Move Now row. វា may suggest ordering, reviewing, repricing, hiding, exposing, or inspecting an item. ប្រើវា as an operator prompt, not an automatic command.

### ជួរឈរ {#pressure-move-column}

Move គឺជា the named recommendation in the Move Now table. វា condenses the row's evidence into an action category so the queue គឺជា scannable. ប្រើវា to prioritize, then read Why now and Expected effect មុនពេល acting.

### ផលប៉ះពាល់រំពឹងទុក {#pressure-move-expected-effect}

Expected effect explains what គួរ improve if the move គឺជា correct. វា may reduce stockout risk, free capital, restore service capacity, or improve margin. ប្រើវា to decide whether the action គឺជា worth the effort now.

### ធ្វើឥឡូវនេះ {#pressure-move-now}

Move Now គឺជា the priority action panel in Pressure. វា បង្ហាញ the few moves បញ្ជី thinks matter most for the selected range and scope. ប្រើវា at the start of a review session, then open rows for evidence មុនពេល changing real operations.

### មូលហេតុពេលនេះ {#pressure-move-why-now}

Why now explains the evidence that made a Move Now item urgent. វា គួរ mention the demand, stock, timing, price, confidence, or pipeline reason behind the recommendation. ប្រើវា to reject or accept a move quickly.

### ភាពយឺតយ៉ាវប្រតិបត្តិការ {#pressure-operational-drag}

Operational drag summarizes items slowing the operation even if they គឺជា not the highest direct stockout risk. វា can include weak support, stale follow-up, or capacity problems. ប្រើវា to find friction that keeps recurring.

### ការតាមដានតម្លៃ {#pressure-price-watch}

Price watch highlights items where price, margin, or recent pricing evidence may require attention. ប្រើវា នៅពេល the pressure គឺជា financial or customer-facing rather than purely stock availability.

### ខ្សែការងារស្តារឡើងវិញ {#pressure-recovery-pipeline}

Recovery pipeline lists items where incoming supply or known receipts may resolve pressure. វា helps avoid duplicate ordering and បង្ហាញ where follow-up គួរ focus on timing. ប្រើវា នៅពេល deciding whether to wait, chase, or order again.

### ខ្សែពេល {#pressure-timeline}

The pressure timeline បង្ហាញ how the operating signal changed over the selected period. វា helps identify whether urgency គឺជា new, worsening, recovering, or stable. ប្រើវា មុនពេល treating one current score as the whole story.

## Money

Money គឺជា financial quality subpage។ វាពន្យល់ sales, gross profit, tied-up capital, margin movement, commitments, និង contributor quality ពី stock-linked evidence។ ប្រើ Money នៅពេលសំណួរគឺ inventory កំពុង earn, leak margin, ឬ trap cash។

### អន្ទាក់ទុនរបស់ក្រុម {#money-band-capital-traps}

Capital traps គឺជា items holding money in stock without enough useful sales movement. They may not be urgent stockouts, but they tie up cash. ប្រើផ្នែកនេះ band to find inventory that គួរ be discounted, paused, rebalanced, or reviewed with the supplier.

### អ្នករកចំណូលរបស់ក្រុម {#money-band-earners}

Earners គឺជា items producing healthy sales or gross profit in the selected window. ប្រើផ្នែកនេះ band to protect reliable revenue drivers, confirm enough stock remains, and avoid starving items that គឺជា converting inventory into cash cleanly.

### ការលេចធ្លាយប្រាក់ចំណេញរបស់ក្រុម {#money-band-margin-leaks}

Margin leaks គឺជា items where sales exist but profit quality គឺជា weak or deteriorating. Causes can include stale costs, underpriced retail, delivery handling, discounts, or high capital drag. ប្រើផ្នែកនេះ band to decide whether price, cost, or exposure needs correction.

### កាតព្វកិច្ចដល់កំណត់ {#money-commitments-due}

Commitments due summarizes customer or supplier money obligations that គឺជា coming up. វា helps show near-term cash pressure, not just historical sales. ប្រើវា នៅពេល deciding whether capital គឺជា available for replenishment.

### ទុនជាប់របស់អ្នកចូលរួម {#money-contributors-capital-tied-up}

Capital tied up គឺជា the current stock-linked money attached to a contributor. វា estimates how much cash គឺជា sitting in inventory for that SKU or service path. ប្រើវា to compare profit against working capital rather than sales alone.

### ធាតុអ្នកចូលរួម {#money-contributors-entity}

Entity identifies the SKU or service contributing to the Money view. វា lets you move from financial summary back to the operational record. Open it នៅពេល the money signal needs a catalog, stock, or pricing correction.

### ប្រាក់ចំណេញដុលរបស់អ្នកចូលរួម {#money-contributors-gross-profit}

Gross profit គឺជា sales បន្ទាប់ពី known or inferred stock-linked cost. វា depends on accurate costs and retail prices, so stale catalog pricing can distort it. ប្រើផ្នែកនេះ column to separate high sales from actually useful sales.

### ការលក់សុទ្ធរបស់អ្នកចូលរួម {#money-contributors-net-sales}

Net sales គឺជា realized stock-linked revenue in the selected window. វា គឺជា based on saved sale/order evidence that បញ្ជី can connect to catalog entities. ប្រើវា as the top-line activity measure, then compare it to gross profit and capital tied up.

### ស្ថានភាពអ្នកចូលរួម {#money-contributors-status}

Status classifies the contributor's financial pattern, such as earning, trapped, leaking, or neutral. វា គឺជា a label for scanning, not a final decision. Use the numeric columns beside it to understand why the label appeared.

### គុណភាពបង្វិលរបស់អ្នកចូលរួម {#money-contributors-turn-quality}

Turn quality describes whether inventory គឺជា converting into money cleanly. វា weighs movement, capital, and profit quality together. ប្រើវា to spot items that sell too slowly, sell at weak margin, or deserve more stock.

### ការគ្របដណ្តប់ {#money-coverage}

Coverage in Money explains how complete the financial view គឺជា for the selected scope. Missing costs, prices, or linked sale evidence can reduce coverage. ប្រើវា មុនពេល trusting totals, especially បន្ទាប់ពី catalog changes or partial data imports.

### អ្នកចូលរួមសេដ្ឋកិច្ច {#money-economic-contributors}

Economic contributors គឺជា the table that explains which entities drive the Money summary. វា breaks total money signals into SKU/service rows with sales, profit, capital, turn quality, and status. ប្រើវា to choose where financial action គួរ happen.

### របាយការណ៍ហិរញ្ញវត្ថុ {#money-financial-statement}

The financial statement គឺជា the top Money summary for the selected range and scope. វា aggregates sales, gross profit, capital, margin, and related signals from stock-linked evidence. ប្រើវា for orientation, then inspect contributors for the reason behind a total.

### ទីតាំងទុនធំបំផុត {#money-largest-capital-positions}

Largest capital positions list where inventory money គឺជា concentrated. These គឺជា not automatically bad; they គឺជា where cash exposure គឺជា largest. Use them to check whether high-value stock គឺជា supported by demand, pipeline, and margin.

### ក្រុមគុណភាព {#money-quality-bands}

Money quality bands group contributors by financial pattern. They separate earners, capital traps, and margin leaks so the user can scan action types instead of reading every row. Use them as a triage board for cash decisions.

### ការប្រែប្រួលប្រាក់ចំណេញថ្មីៗ {#money-recent-margin-shifts}

Recent margin shifts show items whose profit behavior changed in the selected window. They can reveal cost updates, price changes, discounts, or bad data. ប្រើផ្នែកនេះ rail មុនពេល assuming a margin issue គឺជា caused by demand.

### ការភ្ជាប់ប្រភពតេឡេក្រាម {#money-telegram-attribution}

Telegram attribution បង្ហាញ money linked to automation-driven customer intake នៅពេល that path គឺជា available. វា helps separate manual sales from automation-assisted work. ប្រើវា to judge whether customer automation គឺជា producing useful revenue or just noise.

## Explain

Explain គឺជា evidence និង model-inspection subpage។ វាបង្ហាញ timeline, observation ledger, pressure table, fragility map, និង run settings ដែលពន្យល់ថាហេតុអ្វី បញ្ជី បង្ហាញ signal មួយ។ ប្រើ Explain នៅពេល recommendation ត្រូវ audit មុនធ្វើ action។

### ផែនទីភាពងាយរងផលប៉ះពាល់ {#explain-fragility-map}

Shows where services គឺជា constrained by the SKUs they depend on. Each cell compares service demand against the contributing SKU supply path, so use it to find whether a service problem គឺជា really caused by one stock item, several weak dependencies, or no named dependency yet. Open the rail នៅពេល you need the saved evidence behind a blocker instead of acting only on the color.

### បញ្ជីពន្យល់ {#explain-ledger}

The main Explain timeline. វា aligns regimes, stock movement, supplier pipeline, and lead-time behavior across the same intervals so you can see what changed មុនពេល a signal appeared. ប្រើវា នៅពេល you need to trace a recommendation back to observed events rather than reading a single summary score.

### ផ្លូវស្តុករបស់បញ្ជី {#explain-ledger-inventory-lane}

The inventory lane plots expected stock level and observed stock movement over time. វា combines counts, sales, service demand, receipts, and adjustments into one lane so sudden drops or recoveries គឺជា visible. ប្រើវា to check whether a pressure signal គឺជា demand-driven, count-driven, or simply stale ព្រោះ no recent stock count exists.

### ផ្លូវពេលមកដល់របស់បញ្ជី {#explain-ledger-lead-time-lane}

The lead-time lane បង្ហាញ the supplier timing model for each interval. The line គឺជា the expected lead time and the band គឺជា uncertainty, so wider bands mean បញ្ជី has less stable timing evidence. ប្រើវា មុនពេល trusting reorder timing or delivery promises.

### ផ្លូវខ្សែការងាររបស់បញ្ជី {#explain-ledger-pipeline-lane}

The pipeline lane បង្ហាញ supplier order and receipt cues over the timeline. វា helps answer whether incoming stock គឺជា already on the way, whether receipts arrived late, and whether a current shortage may resolve without a new order. ប្រើវា with the lead-time lane មុនពេល creating extra supplier work.

### ផ្លូវលំនាំរបស់បញ្ជី {#explain-ledger-regime-lane}

The regime lane labels each interval with the demand pattern បញ្ជី inferred, such as normal, spike, lull, promo, correction, or stockout-constrained. Price and stockout cue badges show why that interval was classified. ប្រើវា to distinguish a real trend from a one-off event.

### ធាតុដែលការសង្កេតប៉ះពាល់ {#explain-observation-affected-entities}

ផ្នែកនេះ column lists the SKUs or services that an observation touched. វា គឺជា useful នៅពេល one saved update influences several downstream surfaces. If the list គឺជា empty, the observation still exists, but it was not attached to a named catalog entity strongly enough to drive entity-level scoring.

### ប្រភពសញ្ញានៃការសង្កេត {#explain-observation-channels}

ផ្នែកនេះ column បង្ហាញ which evidence channels were present in a saved observation: stock, service ranking, retail ranking, stockout, order, receipt, price, lead-time hint, or note. ប្រើវា to understand why an observation matters មុនពេល opening the rail. Blank-looking channels usually mean the update was narrow, not that it failed.

### សញ្ញាដែលបានសង្កេត {#explain-observation-observed}

The observed column identifies the saved event and its timestamp. វា គឺជា the audit trail behind the Explain workbench. ប្រើវា to find the exact update that changed a signal, then open History or the source record if the observation looks wrong.

### បញ្ជីការសង្កេត {#explain-observations-ledger}

The observations ledger គឺជា the compact table of saved updates used by the Explain run. វា បង្ហាញ what បញ្ជី actually saw, not only what the model inferred. ប្រើផ្នែកនេះ table នៅពេល a score looks surprising and you need to confirm whether the source evidence គឺជា recent, complete, and attached to the right item.

### ធាតុសម្ពាធ {#explain-pressure-item}

The item column names the SKU or service in the Explain pressure table. វា includes enough identity context to separate stock-carrying SKUs from services that depend on linked SKUs. Open the row នៅពេល you need to inspect why that entity គឺជា being scored.

### ហានិភ័យពេលមកដល់ {#explain-pressure-lead-time-risk}

Lead-time risk estimates how much supplier timing uncertainty contributes to pressure. High risk មានន័យថា the item may fail even នៅពេល today's stock looks acceptable, ព្រោះ replenishment timing គឺជា unstable or poorly evidenced. Review supplier orders, receipts, and lead-time hints មុនពេល dismissing it.

### ហានិភ័យខ្សែការងារ {#explain-pressure-pipeline-risk}

Pipeline risk estimates whether incoming supply គឺជា weak, late, missing, or not enough for expected demand. វា គឺជា not just the count of open orders; it also considers timing and support. ប្រើវា to decide whether to chase a supplier ticket or create a new order.

### ភាពងាយប៉ះពាល់តម្លៃ {#explain-pressure-price-sensitivity}

Price sensitivity បង្ហាញ whether recent price or margin behavior may be affecting demand or risk. វា helps separate a stock problem from a pricing problem. ប្រើវា នៅពេល pressure rises បន្ទាប់ពី price changes, promotions, or margin shifts.

### ពិន្ទុសម្ពាធ {#explain-pressure-score}

Pressure score គឺជា the combined urgency score for an entity in Explain. វា blends demand, stock, supplier pipeline, timing, and confidence into a 0-100 signal. Treat it as a prioritization aid, then use the rail and observation ledger to confirm the evidence មុនពេល acting.

### តារាងសម្ពាធ {#explain-pressure-table}

The pressure table ranks entities by operational risk inside the Explain workbench. វា គឺជា built for investigation: scan scores first, then compare pipeline, lead-time, and price columns to see the main driver. ប្រើវា នៅពេល you need to know which item deserves attention and why.

### ធាតុដែលផ្លូវប៉ះពាល់ {#explain-rail-affected-entities}

ផ្នែកនេះ rail block lists the catalog entities attached to the selected observation. វា answers: “What did this saved update touch?” ប្រើវា នៅពេល a note or customer message seems broad and you need to know which SKU or service បញ្ជី connected it to.

### សង្ខេបធាតុដែលផ្លូវប៉ះពាល់ {#explain-rail-affected-entities-summary}

ផ្នែកនេះ overview rail block summarizes the entities most affected by the current Explain run. វា គឺជា a quick map of where the model found evidence, not a task list. ប្រើវា to choose which item to inspect next.

### ប្រភពសញ្ញារបស់ផ្លូវ {#explain-rail-channels}

ផ្នែកនេះ rail block expands the evidence channels for a selected observation. វា បង្ហាញ whether the row came from counts, orders, receipts, ranking signals, prices, lead-time hints, or notes. ប្រើវា to judge whether the observation គឺជា strong enough to explain the downstream signal.

### ជង់អ្នកចូលរួមរបស់ផ្លូវ {#explain-rail-contributor-stack}

Contributor stack បង្ហាញ the pieces that feed the selected entity's pressure signal. For services, this often includes linked SKUs; for SKUs, it may include demand, pipeline, and timing contributors. ប្រើវា to identify the upstream cause មុនពេល editing the catalog or placing orders.

### ការពន្យល់ចន្លោះពេលរបស់ផ្លូវ {#explain-rail-interval-explanation}

ផ្នែកនេះ rail block explains the selected interval in the ledger. វា summarizes the dominant regime, driver, and price or stockout cues for that period. ប្រើវា នៅពេល the timeline mark គឺជា visible but the reason for the classification គឺជា not obvious.

### ការសង្កេតរបស់ផ្លូវ {#explain-rail-observation}

ផ្នែកនេះ rail block បង្ហាញ the selected saved observation in detail. វា includes the title, observed time, and plain-language detail so you can verify the source event. ប្រើវា to decide whether the explanation គឺជា grounded in a real update or a weak note.

### សញ្ញាដែលបានសង្កេតរបស់ផ្លូវ {#explain-rail-observed-signals}

Observed signals គឺជា the specific cues found in the selected interval. They can include demand, receipt, adjustment, price, stockout, or note evidence. Use them to understand why the interval changed instead of assuming the line chart moved by itself.

### ការបញ្ជាទិញ និងពេលមកដល់របស់ផ្លូវ {#explain-rail-orders-transit-lead-time}

ផ្នែកនេះ rail block focuses on supplier order probability, quantities, receipts, transit age, and lead-time class for the selected interval. ប្រើវា នៅពេល the question គឺជា whether supply គឺជា already coming, late, or too uncertain to rely on.

### ទិដ្ឋភាពសង្ខេបរបស់ផ្លូវ {#explain-rail-overview}

The overview rail summarizes the current Explain run មុនពេល anything គឺជា selected. វា បង្ហាញ dominant regime, change-point probability, and coverage context. ប្រើវា to understand the run's overall state មុនពេល drilling into a row or interval.

### ស្ថានភាពប៉ាន់ស្មានរបស់ផ្លូវ {#explain-rail-posterior-state}

Posterior state គឺជា the model's current estimate for the selected entity បន្ទាប់ពី reading the evidence. វា includes units, demand per day, reorder trigger, in-transit exposure, and lead-time estimates. ប្រើវា to see the hidden state behind a pressure score.

### គោលការណ៍បញ្ជាទិញបន្ថែមរបស់ផ្លូវ {#explain-rail-reorder-policy}

Reorder policy បង្ហាញ the model's recommended supplier action for a selected SKU. វា includes need probability, recommended order, likely range, protection horizon, and policy basis. ប្រើវា as planning guidance, then check real supplier constraints មុនពេល ordering.

### ការកំណត់របស់ផ្លូវ {#explain-rail-settings}

ផ្នែកនេះ rail block identifies the selected SKU or service and gives the short pressure explanation. វា គឺជា the entity inspector header, not the global Settings page. ប្រើវា to confirm you គឺជា inspecting the right item មុនពេល opening its Catalog detail.

### ប្រភពសញ្ញាខ្លាំងបំផុតរបស់ផ្លូវ {#explain-rail-strongest-channels}

Strongest channels summarize which evidence types most influenced the current Explain run. They help answer whether the run គឺជា being driven by stock counts, orders, receipts, pricing, notes, or lead-time evidence. Use them to spot missing data channels.

### អ្វីបានកើតឡើងក្នុងផ្លូវ {#explain-rail-what-happened}

ផ្នែកនេះ rail block breaks the selected interval into service demand, retail demand, receipts, and adjustments. ប្រើវា to separate customer demand from stock movement. វា គឺជា especially useful នៅពេល a net stock change hides several opposite events.

### ការប៉ាន់ស្មានការគ្របដណ្តប់ {#explain-settings-coverage-estimate}

Coverage estimate states how much of the relevant catalog had enough evidence for the run. Low coverage មានន័យថា the run may be blind to parts of the operation. Add counts, linked SKUs, prices, or observations មុនពេល relying on fine-grained comparisons.

### ទំហំគំរូមានប្រសិទ្ធភាព {#explain-settings-effective-sample-size}

Effective sample size គឺជា the amount of usable evidence បន្ទាប់ពី weighting, smoothing, and recency effects. វា can be lower than the raw observation count. ប្រើវា to judge whether the model has enough signal or គឺជា stretching sparse data.

### ចន្លោះពេល {#explain-settings-intervals}

Intervals tells how many timeline windows the Explain run evaluated. More intervals can reveal trend and timing behavior; fewer intervals make the run easier to read but less historical. ប្រើវា to understand the time depth behind the visible charts.

### ការសង្កេតចុងក្រោយ {#explain-settings-latest-observed}

Latest observed គឺជា the newest saved event included in the Explain run. If this timestamp គឺជា old, the output may be stale even if the screen loaded correctly. Capture a fresh update មុនពេល acting on time-sensitive pressure.

### ការសង្កេតដែលបានប្រើ {#explain-settings-observations-used}

Observations used គឺជា the count of saved events included បន្ទាប់ពី filtering and scope selection. វា tells you whether the run had enough real data to work with. If it គឺជា low, inspect scope, supplier filter, date range, and recent capture activity.

### ផ្ទាំងការកំណត់ {#explain-settings-panel}

The settings panel explains the run configuration behind Explain. វា lists run ID, latest observation, interval count, smoothing, sample size, error, coverage, and scope. ប្រើវា នៅពេល two users see different results or a run needs to be audited.

### កំហុសព្យាករណ៍ {#explain-settings-predictive-error}

Predictive error estimates how far the model has recently been from observed outcomes. Higher error មានន័យថា the explanation គួរ be treated as directional, not precise. Improve it by adding fresher counts, receipts, and outcome observations.

### លេខសម្គាល់ការរត់ {#explain-settings-run-id}

Run ID គឺជា the internal identifier for the Explain run currently displayed. វា helps connect screenshots, logs, and support reports to one explanation pass. ប្រើវា នៅពេល comparing runs or debugging why an explanation changed.

### វិសាលភាព {#explain-settings-scope}

Scope describes which catalog entities, supplier filters, and time window were included. ប្រើវា មុនពេល comparing numbers across screens: two runs with different scope គឺជា not directly comparable.

### ការធ្វើឲ្យរលោង {#explain-settings-smoothing}

Smoothing controls how strongly the run softens noisy observations. More smoothing reduces jumps from one-off events; less smoothing reacts faster to new evidence. ប្រើវា to understand why a fresh update may not fully dominate the chart.

## Automations

Automations គ្រប់គ្រង configuration និង customer-facing exposure សម្រាប់ automation។ ប្រើវាដើម្បីគ្រប់គ្រង Telegram connection, សម្រេចថា sellables ណាដែល bot អាច offer, និងរក្សា customer-facing catalog data ឱ្យរួចរាល់។ Intake review មាន Help section ដាច់ដោយឡែក ព្រោះវាជា Work subpage មិនមែនត្រឹម configuration panel ទេ។

### ទិដ្ឋភាពសង្ខេប {#automation-overview}

Automation tables ប្រើពាក្យទាំងនេះ៖

- **Exposure** មានន័យថា SKU ឬ service បង្ហាញទៅ customer-facing bot។
- **Intake** មានន័យថា customer request ដែលបានចាប់យកពី Telegram ឬ automated source ផ្សេង។
- **Exception** មានន័យថា បញ្ជី មិនអាចបម្លែង message ទៅ normal work ដោយជឿជាក់បាន ហើយត្រូវការ operator review។
- **Alias** គឺជា customer-facing name ដែលអាចខុសពី internal catalog name។
- **Confidence** បង្ហាញថា parser ឬ matcher ជឿជាក់ប៉ុន្មានលើ inferred customer request។

Exposure, intake, និង exception headers ពន្យល់ថា value មួយត្រូវបានវាស់ពី catalog data, inferred ពី customer text, ឬរង់ចាំ operator decision។

### ធាតុដែលបានបង្ហាញ {#automation-exposure-entity}

Entity គឺជា internal SKU ឬ service record ដែល automation អាច mention ទៅ customers។ បើ customer-facing answer មើលទៅខុស សូមបើក entity ព្រោះបញ្ហាធម្មតា គឺ catalog naming, price, archive state, ឬ linked-SKU setup។

### ប្រភេទការបង្ហាញ {#automation-exposure-type}

Type បំបែក stock-carrying SKUs ពី services។ SKUs ពឹងលើ direct stock និង retail sellability។ Services ពឹងលើ linked SKUs និង service availability។

### តម្លៃដែលបានបង្ហាញ {#automation-exposure-price}

Price គឺជា customer-facing amount ដែល automation អាច quote។ Missing prices គួរត្រូវបានកែក្នុង Catalog មុនពេល expose item ទៅ customer messages។

### ភាពមានស្រាប់ដែលបានបង្ហាញ {#automation-exposure-availability}

Availability ពន្យល់ថា entity អាចផ្តល់ជូនពី current catalog និង stock data បានឬអត់។ Hidden, limited, unavailable, និង available states គួរត្រូវបានពិនិត្យមុន toggle exposure។

### ស្ថានភាពការបង្ហាញ {#automation-exposure-exposed}

Exposed គ្រប់គ្រងថា entity អាចមើលឃើញដោយ customer-facing automation ឬអត់។ រក្សា catalog items ដែលមិនច្បាស់ឱ្យ unexposed រហូតដល់ names, prices, aliases, និង availability រួចរាល់សម្រាប់ customers។

### ឈ្មោះហៅការបង្ហាញ {#automation-exposure-alias}

Alias គឺជា customer-facing name ដែល automation ប្រើជំនួស internal catalog name។ ប្រើ aliases សម្រាប់ពាក្យដែល customer ប្រើញឹកញាប់, alternate spellings, Khmer/English names, និង short names។

### ការកំណត់រចនាសម្ព័ន្ធ {#automation-configuration}

Configuration គឺជា the Telegram connection panel. វា holds bot identity, token, username, and external link settings that let បញ្ជី receive or route customer intake. ប្រើវា only បន្ទាប់ពី catalog prices, exposure, and operator review expectations គឺជា ready.

### ទំនិញលក់បានដែលបានបង្ហាញ {#automation-sellables-exposed}

Sellables exposed to Telegram គឺជា the customer-facing catalog control. វា decides which SKUs and services automation can mention, quote, or offer. ប្រើវា to hide incomplete items and expose only records with clear names, prices, aliases, and availability.

## History

History គឺជាប្រវត្តិ saved update។ វាជា maintenance/context surface មិនមែនជា destination នៅ sidebar ទេ។

ប្រើ History ដើម្បី៖

- ស្វែងរក saved reports
- មើល heatmap ឬ all-reports list
- បើក report
- edit report តាម Capture flow
- delete report បន្ទាប់ពី confirmation

History ពន្យល់អ្វីដែលបានរក្សាទុក។ Work ពន្យល់អ្វីដែលត្រូវធ្វើឥឡូវនេះ។

## Settings

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

### ការណែនាំប៉ារ៉ាម៉ែត្រ {#settings-parameter-guidance}

Parameter guidance explains SENA planning inputs such as particle count, service level, quantiles, and intervals. These settings change how conservative or responsive analysis becomes. Adjust them only នៅពេល you understand the tradeoff between stability, speed, and risk.

### ការធ្វើឲ្យរលោង {#settings-smoothing}

Smoothing controls whether បញ្ជី softens noisy SENA signals in Settings. When enabled, charts and recommendations may react less sharply to one-off updates. ប្រើវា for steadier operations; disable it only នៅពេល immediate responsiveness matters more than noise control.

## First Useful Workflow

សម្រាប់ workspace ថ្មី លំហូរខ្លីដែលមានប្រយោជន៍គឺ៖

1. បើក Catalog ហើយបង្កើត SKUs ឬ services ដែលក្រុមលក់ពិត។
2. បន្ថែម supplier, cost, price, lead-time, និង linked-SKU details នៅពេល fields ទាំងនោះប៉ះពាល់ការសម្រេចចិត្ត។
3. បើក Work / Capture ហើយ save stock count ឬ order ពិតដំបូង។
4. Save update ពិតទីពីរ នៅពេលមានពេល ឬសកម្មភាពគ្រប់គ្រាន់សម្រាប់ banji ប្រៀបធៀប intervals។
5. ត្រឡប់ទៅ Work ដើម្បីមើល supplier ឬ customer tasks ដែលត្រូវយកចិត្តទុកដាក់។
6. បើក Insights / Pressure ដើម្បីយល់ demand, available capacity, pipeline support, confidence, និង next action។
7. បើក Insights / Money នៅពេលត្រូវការ sales, gross profit, tied-up capital, ឬ leakage context។

Search keywords: start, setup, onboarding, first update, first count, first order, first sale, first analysis។

## Glossary

### ពាក្យសំខាន់ៗ {#glossary-terms}

- **Pressure**៖ signal អាជីវកម្មថា demand, stock, timing, price, ឬ supplier flow អាចត្រូវការសកម្មភាព។
- **Coverage**៖ current stock ឬ sellable capacity អាចគ្រប់គ្រាន់សម្រាប់ expected demand បានប៉ុន្មាន។
- **Pipeline support**៖ open supplier orders ឬ receipts ដែលអាចស្ដារស្តុកមុន demand បង្កបញ្ហា។
- **Available capacity**៖ units ឬ service deliveries ដែលអាចលក់បានពី current stock និង linked dependencies។
- **Sellable**៖ SKU ឬ service ដែល active ហើយអាចផ្តល់ទៅ customers។
- **Stock-limited pattern**៖ pattern ដែល current stock កំណត់ delivery ឬ sales។
- **Confidence**៖ កម្រិតជំនឿលើ signal ផ្អែកលើ saved evidence និង model stability។
- **SENA-derived columns**៖ values ដែល inferred ដោយ local analysis engine មិនមែន typed directly ដោយ operator។

Search keywords: risk, urgency, reorder, stockout, can sell, available, demand, capacity, pipeline, support, inference, model, money, margin។

## សំណួរញឹកញាប់

### តើគួរបញ្ចូលអ្វីមុន?

ចាប់ផ្តើមពីទំនិញ និងសេវាកម្មសំខាន់ៗជាមុន បន្ទាប់មកកត់ត្រាអាប់ដេតស្តុកពិតមួយ។ ការរៀបចំតូចតែត្រឹមត្រូវ ល្អជាងការរៀបចំធំតែទាយ។ ពេលមានទំនិញ សេវាកម្ម អ្នកផ្គត់ផ្គង់ តម្លៃ និងចំនួនស្តុកដំបូង បញ្ជីនឹងមានបរិបទគ្រប់គ្រាន់សម្រាប់អាប់ដេតបន្ទាប់ៗ។

### តើអាចប្រើបញ្ជី មុនពេលព័ត៌មានគ្រប់យ៉ាងល្អឥតខ្ចោះបានទេ?

បាន។ ប្រើបញ្ជីដូចសៀវភៅកត់ត្រាការងារជាមុន ហើយកែលម្អគុណភាពទិន្នន័យបន្តិចម្តងៗ។ ដាក់ព័ត៌មានមិនប្រាកដក្នុងកំណត់សម្គាល់ កុំបង្កើតចំនួនជាក់លាក់ដោយទាយ ហើយកែការរៀបចំកាតាឡុកពេលបញ្ហាដដែលកើតឡើងម្តងហើយម្តងទៀត។ កម្មវិធីនឹងមានប្រយោជន៍កាន់តែច្រើន ពេលភស្តុតាងដែលបានរក្សាទុកកើនឡើង។

### តើគួរកត់ត្រាអាប់ដេតញឹកញាប់ប៉ុន្មាន?

កត់ត្រាអាប់ដេតរាល់ពេលមានការពិតក្នុងការងារផ្លាស់ប្តូរ៖ ចំនួនស្តុក បញ្ជាទិញអតិថិជន បញ្ជាទិញអ្នកផ្គត់ផ្គង់ ការទទួលទំនិញ តម្លៃ ភាពមានស្រាប់ ឬតម្រូវការខុសធម្មតា។ សម្រាប់អាជីវកម្មតូចជាច្រើន ការកត់ត្រាប្រចាំថ្ងៃគ្រប់គ្រាន់ ប៉ុន្តែការផ្លាស់ប្តូរស្តុក ឬអ្នកផ្គត់ផ្គង់ដែលបន្ទាន់ គួរកត់ត្រាពេលវាកើតឡើង។

### តើធ្វើដូចម្តេច បើការណែនាំមើលទៅមិនត្រឹមត្រូវ?

ពិនិត្យភស្តុតាងដើមជាមុន មុនពេលផ្លាស់ប្តូរការងារពិត។ រកមើលចំនួនស្តុកចាស់ ការទទួលទំនិញដែលខ្វះ ការភ្ជាប់អ្នកផ្គត់ផ្គង់ខុស តម្លៃខុស ធាតុដែលបានរក្សាទុកជាឯកសារ ឬកំណត់សម្គាល់ដែលមិនច្បាស់។ បើភស្តុតាងខុស សូមកែកាតាឡុក ឬកត់ត្រាអាប់ដេតកែតម្រូវ មិនត្រូវមើលរំលងសញ្ញាដោយស្ងាត់ៗទេ។

### ហេតុអ្វីសញ្ញាខ្លះបង្ហាញទំនុកចិត្តទាប?

ទំនុកចិត្តទាបជាញឹកញាប់មានន័យថា កម្មវិធីមានភស្តុតាងតិច ចាស់ ឬផ្ទុយគ្នា។ បន្ថែមចំនួនស្តុកថ្មី កត់ត្រាបញ្ជាទិញ ឬការទទួលទំនិញដែលខ្វះ ពិនិត្យទំនិញដែលភ្ជាប់សម្រាប់សេវាកម្ម ហើយបញ្ជាក់តម្លៃ ឬការសន្មត់ពេលមកដល់។ ទំនុកចិត្តគួរតែប្រសើរឡើង ពេលប្រវត្តិដែលបានរក្សាទុកកាន់តែស្របគ្នា។

### តើគួរធ្វើអ្វីមុនពេលលុប ឬស្តារទិន្នន័យក្នុងម៉ាស៊ីន?

នាំចេញ ឬបង្កើតច្បាប់ចម្លងបម្រុងទុកកន្លែងធ្វើការជាមុន បន្ទាប់មកបញ្ជាក់ថាអ្នកកំពុងធ្វើការលើឧបករណ៍ និងថតទិន្នន័យត្រឹមត្រូវ។ ការលុបទិន្នន័យក្នុងម៉ាស៊ីនគួរប្រើសម្រាប់ចាប់ផ្តើមឡើងវិញ ឬស្តារពីកន្លែងធ្វើការសាកល្បងដែលខូច។ ការស្តារស្នាមចម្លងគួរត្រូវបានគិតថា ជាការជំនួសសេចក្តីពិតក្នុងម៉ាស៊ីនបច្ចុប្បន្ន។
