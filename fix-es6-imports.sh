find distES6 -type f -name '*.js' -print0 | xargs -0 sed --in-place -E "s/from [\"\']([^\"\']+[^.][^j][^s])[\"\'];$/from \"\\1.js\";/g"