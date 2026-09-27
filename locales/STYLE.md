# Customer language style

English sources are stable message identifiers. Preserve placeholders, customer-entered data, carrier names, addresses, phone numbers and option values. Translate complete linked sentences through messages.json when word order differs; keep the actual links as named slots.

## Spanish

Use clear Mexican Spanish, addressing customers as usted. Jordan explicitly prefers **punto de envío** over sucursal or mostrador for a shipping location. Use **personal** for the people helping the customer, **empaque / empacar**, **pedir una cotización**, **recolección a domicilio** for picking up the customer's shipment, and **pasar por su pedido/correo** when customers collect something. Do not use recolección for both directions without context. Preserve DHL Express Service Point as the official service identity, translating its explanatory wording as punto de servicio.

Buttons use short infinitives; instructions use polite direct verbs. A request code is not a carrier tracking number. Submitting a request does not pay for shipping or confirm a pickup. Prices and availability require staff confirmation. Avoid developer language about connecting rate tables.

## Arabic

Use clear professional Modern Standard Arabic with direct, concise instructions. Prefer فرع, فريق الفرع, طلب عرض سعر, ملصق الشحن, and رقم تتبع شركة الشحن consistently. Use استلام الشحنة من عنوانك for pickup from the customer, and استلام طلبك من الفرع for collection at the branch. Do not imply quotes, dispatch or pickup are confirmed when only a request was received.

Keep RTL typography, phone/address isolation, and the Arabic hero's generous line height and gutters. Check glyphs in actual screenshots; absence of horizontal scrolling does not prove the text is unclipped.

## Review

Check the complete guest quote/drop-off flow, confirmation and request status, location search, validation and language switching. Human terminology review is still required to substantiate a higher editorial rating; automated checks alone are not a language-quality score. Do not claim reviewer approval before it is received.

## Additional languages

The picker uses native names and respects the customer's explicit choice before their browser language. Shipping destination, ZIP and device coordinates must never determine the language.

Use clear customer instructions and consistent shipping terminology in every locale. Preserve the difference between an estimated date and a guaranteed date, between shipment protection and insurance, and between a request reference and a carrier tracking number. Keep prices and pickup availability subject to staff confirmation. Translate the existing privacy and terms faithfully; do not introduce a policy giving one language legal precedence.

Additional catalogs live in `locales/extra/{code}.json`, keyed by the same complete English message IDs as the generated catalog. `locales/languages.json` defines native names, direction, share metadata locale and loading errors. The build rejects missing/extra keys, empty strings and changed interpolation slots. It emits content-hashed catalogs loaded only when selected and a pretranslated homepage for each share URL. These checks establish coverage, not native editorial approval.

Review the less familiar and specialized terms with customers or staff who speak that language. Record actual feedback instead of assigning a higher language score from test results alone.
