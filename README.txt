K čemu knihovna / třída KisReaderClient.
knihovna zajištuje, aby navázené spojení bylo funkční a případně spojení obnovuje. v momentech kdy je spojení vytvořeno, přerušeno, obnoveno, nebo definitivně uzavřeno, mění svuj veřejně čitelný stav + vysílá eventy. Knihovna nijak neukládá požadavky do front ani nijak jinak neplánuje -- pokud je požadavek např. na čtení karty nebo změnu displeje předán během špatného stavu klienta tedy např ve chvíli kdy je (dočasně = reconnecting, trvale = disconnected) odpojena, tyto požadavky zahazuje nebo reaguje výjimkou
knihovna udržuje v paměti aktuální nastavený mód čtečky (idle, reading one card, reading multiple cards, ...), a tento mód po případném obnovení spojení ihned znovu nastavuje.
funkcionalita pro reportování uživateli, že daná akce nemohla být provedena (protože čtečka byla právě v tomto XXX stavu) nebo alternativě řazení těchto user-akcí do short-lived front musí být implementována na straně aplikace nebo v další vrstvě abstrakce nad základní třídou knihovny.

Další popis viz src/ IClient.ts Client.ts SimpleClient.ts a WrapperClient.ts
