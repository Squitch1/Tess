#! /bin/bash

# This script is intended to be run on a Debian system and must be run before
#   any attempt at building a package by using  ./build.sh. It bootstraps the
#   system (ideally a fresh virtual machine or a docker container) by
#   installing required dependencies and creating the chroot environment
#   according to ARCH env variable.
# Env variables:
#   * ARCH (required)
#   represent the package architecture and must be any item of this list:
#       * amd64
#       * i386

if [[ -z "${ARCH}" ]]; then
    echo "error: \$ARCH must be set" >&2 && exit 1
fi


apt-get update
apt-get -y install lintian \
    devscripts \
    sbuild \
    debootstrap \
    schroot \
    deborphan \
    qemu-user-static \
    binfmt-support


sbuild-createchroot \
    --arch=$ARCH \
    bookworm \
    /srv/chroot/bookworm-$ARCH \
    http://deb.debian.org/debian