#! /bin/bash

# This script is intended to be run on a Fedora system and must be run before
#   any attempt at building a package by using  ./build.sh. It bootstraps the
#   system (ideally a fresh virtual machine or a docker container) by
#   installing required dependencies.

dnf install -y mock rpmspec cargo