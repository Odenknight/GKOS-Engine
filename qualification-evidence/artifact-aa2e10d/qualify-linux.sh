set -euo pipefail
cd "$HOME/gkos-engine-220-qualification/aa2e10d/consumer"
npm init -y > init.log 2>&1
npm install --ignore-scripts ./gkos-engine-2.2.0.tgz > install.log 2>&1
node consumer-smoke.mjs ./gkos-engine-2.2.0.tgz aa2e10d16983b6cbd4107464f376d87d3c546db3 > consumer-smoke.log 2>&1
export GKOS_CONSUMER_ROOT="$PWD"
export GKOS_TARBALL_PATH="$PWD/gkos-engine-2.2.0.tgz"
export GKOS_TARBALL_SHA256=8b4cc0eb16be7c07b61f66d684e4b50810f94dd4a766b7a82195d48baed6c48a
node --test qualify-no-change-gaps.test.mjs > no-change-gaps.tap 2>&1
