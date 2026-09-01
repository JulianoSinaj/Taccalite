# Media bottega — clip pronti all'uso

Clip ricavati da due reel Instagram, ripuliti e rifiniti. Nessun logo, nessun
testo sovrimpresso, nessuna grafica social. Tutti **muti** (`-an`) e con
`+faststart`: pensati per `<video autoplay muted loop playsinline>`.

Risoluzione **720x1280** (la nativa della sorgente). I master a 1080x1920 stanno
fuori dal repo, in `Desktop/Taccalite-media-master/clip-1080/`.

## hero-reel-mestiere.mp4 / .webm — 25,6 s

I dieci clip b-roll in sequenza, montati per crescere fino al tagliere finale.
Solo mani e coltello, nessun volto. Pensato come sfondo hero.

```html
<video autoplay muted loop playsinline poster="/video/poster/hero-reel-mestiere.jpg">
  <source src="/video/hero-reel-mestiere.webm" type="video/webm" />
  <source src="/video/hero-reel-mestiere.mp4"  type="video/mp4" />
</video>
```

## broll/ — mestiere, senza volti

| file | durata | contenuto |
|---|---|---|
| `01-coppa-affettata.mp4` | 1,9 s | fette di coppa che cadono sul tagliere d'ulivo |
| `02-salame-coltello.mp4` | 3,6 s | coltello che affetta il salame |
| `03-salame-macro.mp4` | 3,2 s | macro del salame, profondità di campo cortissima |
| `04-coppa-macro.mp4` | 1,6 s | macro della coppa marezzata |
| `05-formaggio-taglio.mp4` | 2,2 s | taglio del formaggio a pasta molle |
| `06-parmigiano.mp4` | 4,7 s | lama sulla scaglia di parmigiano |
| `07-pecorino.mp4` | 2,1 s | taglio del pecorino occhiato |
| `08-miele.mp4` | 2,2 s | colatura di miele sul tagliere |
| `09-creme-olive.mp4` | 1,4 s | creme e olive in vaschetta |
| `10-tagliere-finale.mp4` | 2,7 s | carrellata sul tagliere composto |

## paolo/ — il norcino al lavoro

| file | durata | contenuto |
|---|---|---|
| `01-bottega-tagliere.mp4` | 2,1 s | attraversa la bottega col tagliere |
| `02-calice.mp4` | 1,2 s | in piedi col calice, ritratto |
| `03-affetta-coppa.mp4` | 2,0 s | affetta la coppa, ritratto di profilo |
| `04-forma-formaggio.mp4` | 2,0 s | apre la forma di formaggio |
| `05-impiatta.mp4` | 1,5 s | impiatta al banco |
| `06-porta-tagliere.mp4` | 1,7 s | porta il tagliere in sala |
| `07-bancone-lavoro.mp4` | 3,0 s | al bancone (720x980, vedi nota) |

## poster/

Un fermo immagine per ogni clip, 720 px di larghezza. Vanno nell'attributo
`poster` così il primo frame non resta bianco durante il caricamento.

## Note

- **`07-bancone-lavoro` è 720x980**, non 720x1280: il reel di origine aveva i
  sottotitoli impressi in basso e una grafica verde nell'angolo, entrambi
  dentro il fotogramma. L'unico modo pulito per toglierli era tagliare la
  fascia inferiore. Da usare in un riquadro, non a tutto schermo.
- **Nessun cliente inquadrato.** Il reel conteneva una scena con due clienti al
  tavolo, riconoscibili in volto: l'ho esclusa, non avendo il loro consenso per
  la pubblicazione. Se serve, sta nell'originale a 3,5–5,2 s.
- **Peso**: ~22 MB in totale. Se il repo cresce troppo, i candidati da spostare
  su CDN sono `hero-reel-mestiere.*` (10 MB) — oppure si tengono solo quelli e
  si eliminano i `broll/` singoli, che sono le stesse riprese.
- **Qualità**: la sorgente è compressa (~1,5 Mbps). Ho applicato deblock,
  denoise temporale, sharpen leggero e una gradazione contenuta. Non è possibile
  recuperare dettaglio che nel file originale non c'è: per andare oltre serve un
  upscaler AI sui master 1080p.
