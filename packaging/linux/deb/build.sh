#! /bin/bash

# This script is intended to be run on a Debian system after a successful 
#   completion of ./boostrap.sh. The resulting deb package is moved to 
#   packaging/out/linux/ (based on the root of the repository).
# If USE_PREBUILT is unset, the script will attempt to build the package from
#   source, which may not work at this time. Otherwise, the package will be
#   built by using the prebuild binary and the required resources
#   (a.k.a. man pages) must be present in packaging/linux/resources/man.
# Env variables:
#   * ARCH (required):
#   represent the package architecture and must be any item of this list:
#       * amd64
#       * i386
#   * USE_PREBUILT (optional):
#   If defined, point to the prebuilt binary going to be packaged, It's the user
#       responsibility to ensure that the binary and $ARCH match

set -e

if [[ -z "${ARCH}" ]]; then
    echo "error: \$ARCH must be set" >&2 && exit 1
fi


script_dir=$(dirname $(realpath $0))
pkgver=$(dpkg-parsechangelog -l "$script_dir/debian/changelog" -S Version | cut -d "-" --fields 1)
build_dir="/tmp/build/tess-$pkgver"
empty_rules_file="#!/usr/bin/make -f\n\n%:\n\tdh \$@"


rm -rf $build_dir
mkdir -p $build_dir
mkdir -p "$build_dir/resources"

cp -r "$script_dir/debian" "$build_dir/debian"
cp -r "$script_dir/../resources/desktop" "$build_dir/resources/desktop"
cp -r "$script_dir/../../../src" "$build_dir/src"
cp -r "$script_dir/../../../icons" "$build_dir/icons"
cp -r "$script_dir/../../../src-tauri" "$build_dir/src-tauri"
cp "$script_dir/../../../package.json" "$build_dir"
cp "$script_dir/../../../package-lock.json" "$build_dir"
cp "$script_dir/../../../vite.config.ts" "$build_dir"
cp "$script_dir/../../../tsconfig.json" "$build_dir"

if [[ -n "${USE_PREBUILT}" ]]; then
    cp "$USE_PREBUILT" "$build_dir/resources/tess"
    cp -r "$script_dir/../resources/man" "$build_dir/resources/man"

    echo "resources/tess usr/bin/" >> "$build_dir/debian/install"
    echo -e "$empty_rules_file" > "$build_dir/debian/rules"
    cd $build_dir
    for manpage in resources/man/*; do
        echo "$manpage" >> "$build_dir/debian/tess.manpages"
    done
fi

cd $(dirname $build_dir)
tar czf tess_$pkgver.orig.tar.gz "--exclude='./tess-$pkgver/debian'" -C tess-$pkgver .

cd $build_dir

sbuild -d bookworm --arch=$ARCH

mkdir -p "$script_dir/../../out/linux/"
cp $(dirname $build_dir)/*.deb "$script_dir/../../out/linux/"