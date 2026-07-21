package web

import "embed"

// Dist holds the built SPA assets. Build with `npm run build` in this directory.
//
//go:embed all:dist
var Dist embed.FS
