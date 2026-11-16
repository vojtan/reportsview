# Přehled podnětů a závad města Děčín

Otevřete soubor `dist/index.html` v běžném prohlížeči. Přehled funguje přímo z disku bez serveru, připojení k internetu nebo instalace. Pokud složky přesouváte, zachovejte `prehled` a `images` vedle sebe, aby se načítaly fotografie.

- **Přehled** zobrazuje ukazatele a grafy. Kliknutím na sloupec nebo kategorii použijete odpovídající filtr.
- **Hlášení** můžete prohledat podle textu nebo čísla. Filtry zahrnují stav, kategorii, datum nahlášení a fotografie. Kliknutím na řádek otevřete detail s popisem, GPS souřadnicemi, fotografiemi a komentáři.
- **Mapa hlášení** zobrazuje GPS body na místním podkladu ulic Děčína a okolí. Pomocí tlačítek můžete přiblížit oblast. Číslovaný bod otevře seznam hlášení v dané skupině.
- **Nastavení statistik** umožňuje měnit ukazatele, grafy, časové seskupení a rozsah dat. Výchozí nastavení počítá statistiky z aktuálně vyfiltrovaných hlášení. Prohlížeč si předvolby pamatuje, pokud povoluje místní úložiště pro soubory na disku.

Nevyřešená hlášení odpovídají stavu `in_progress` (V řešení). Míra vyřešení je podíl hlášení ve stavu `solved` (Vyřešeno) ze všech hlášení ve zvoleném rozsahu. Časový graf seskupuje hlášení podle data nahlášení a používá stav z exportu.

## Aktualizace exportu

Nahraďte `reports.json` a doplňte fotografie do složky `images` podle cest v exportu. Z kořene složky `munipolis` spusťte s nainstalovaným Node.js:

```powershell
node prehled/update-data.cjs
```

Obnovte stránku v prohlížeči. Skript vytvoří soubor `data.js`, který může stránka načíst přímo z disku.

## Mapový podklad

Soubor `dist/map-data.js` obsahuje místní výřez z [OpenStreetMap](https://www.openstreetmap.org/copyright) pod licencí ODbL 1.0. Zdrojovým souborem je [výřez Ústeckého kraje od Geofabrik](https://download.geofabrik.de/europe/czech-republic/ustecky.html). Pokud chcete mapová data aktualizovat, stáhněte soubor `.osm.pbf` a spusťte s Node.js a GDAL:

```powershell
node prehled/build-basemap.cjs cesta-k-vyrezu.osm.pbf
```
