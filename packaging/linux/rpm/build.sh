#! /bin/bash

# This script is intended to be run on a Fedora system after a successful 
#   completion of ./boostrap.sh. The resulting rpm package is moved to 
#   packaging/out/linux/ (based on the root of the repository).
# If USE_PREBUILT is unset, the script will attempt to build the package from
#   source, which may not work at this time. Otherwise, the package will be
#   built by using the prebuild binary and the required resources
#   (a.k.a. man pages) must be present in packaging/linux/resources/man.
# Env variables:
#   * ARCH (required):
#   Represent the package architecture and must be any item of this list:
#       * x86_64
#   * USE_PREBUILT (optional):
#   If defined, point to the prebuilt binary going to be packaged, It's the user
#       responsibility to ensure that the binary and $ARCH match

set -e

if [[ -z "${ARCH}" ]]; then
    echo "error: \$ARCH must be set" >&2 && exit 1
fi


script_dir=$(dirname $(realpath $0))
pkgver=$(rpmspec -q --qf "%{VERSION}\n" "$script_dir/tess.spec")
build_dir="/tmp/build/tess-$pkgver"
sources_dir="/tmp/build/SOURCES"


rm -rf $build_dir
rm -rf $sources_dir
mkdir -p $build_dir
mkdir -p $sources_dir
mkdir -p "$build_dir/resources"

# Finish copying all required file
cp -r "$script_dir/../resources/desktop" "$build_dir/resources/desktop"
cp "$script_dir/../../../LICENSE" "$build_dir"
cp -r "$script_dir/../../../icons" "$build_dir/icons"
cp -r "$script_dir/../../../src" "$build_dir/src"
cp -r "$script_dir/../../../src-tauri" "$build_dir/src-tauri"

if [[ -n "${USE_PREBUILT}" ]]; then
    cp "$USE_PREBUILT" "$build_dir/resources/tess"
    cp -r "$script_dir/../resources/man" "$build_dir/resources/man"
else
    cargo clean --manifest-path "$build_dir/src-tauri/Cargo.toml"
    cargo vendor "$build_dir/src-tauri/vendor" --manifest-path "$build_dir/src-tauri/Cargo.toml"
fi

cd $(dirname $build_dir)
tar czf "tess-$pkgver.tar.gz" "tess-$pkgver"
cp "tess-$pkgver.tar.gz" "$sources_dir/"

rm -rf $build_dir
if [[ -n "${USE_PREBUILT}" ]]; then
    mock -r "fedora-41-$ARCH" --buildsrpm --spec "$script_dir/tess-prebuilt.spec" --sources "$sources_dir" --resultdir "$build_dir"
    mock -r "fedora-41-$ARCH" --rebuild $build_dir/tess-*.src.rpm --define "prebuilt 1"
else
    mock -r "fedora-41-$ARCH" --buildsrpm --spec "$script_dir/tess.spec" --sources "$sources_dir" --resultdir "$build_dir"
    mock -r "fedora-41-$ARCH" --rebuild $build_dir/tess-*.src.rpm
fi

mkdir -p "$script_dir/../../out/linux/"
cp /var/lib/mock/fedora-41-$ARCH/result/*$ARCH.rpm "$script_dir/../../out/linux/"
