# kis-reader-lib

Knihovna pro integraci čtečky karet s KIS aplikacemi.

## Překlad

### První kroky

```sh
npm install
```

### Překlad do ES6 modulů

vyžaduje linux/msys/wsl pro spuštění fix-es6-imports.sh

výstup v distES6/

```sh
npm run build
```

### Překlad do ES6 single file globálního objektu KISReaderLib

výstup v dist/lib.js

```sh
npm run brow-onefile
```


### Vymazání souborů

```sh
npm run clean
```

#### Pozor

Nemaže soubory přeložené příkazem `npm run onefile`.

### Přeložení do jednoho souboru

```sh
npm run onefile
```

## Zdroje

- [@zeit/NCC](https://www.npmjs.com/package/@zeit/ncc)
- [Typescript](https://www.npmjs.com/package/typescript)
- [@types/websocket](https://www.npmjs.com/package/@types/websocket)
- [@types/node](https://www.npmjs.com/package/@types/node)
