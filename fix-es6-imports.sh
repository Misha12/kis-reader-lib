find distES6 -type f -name '*.js' -print0 | xargs -0 perl -pi -e "s/from [\"\']([^\"\']+)"'(?<!\.js)'"[\"\'];/from \"\\1.js\";/g"
