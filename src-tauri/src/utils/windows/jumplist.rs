use std::fmt::Display;

use windows::{
    core::{Interface, PCWSTR},
    Win32::{
        Storage::EnhancedStorage::PKEY_Title,
        System::Com::{
            CoCreateInstance, CoInitialize, CoUninitialize,
            StructuredStorage::InitPropVariantFromStringAsVector, CLSCTX_INPROC_SERVER,
        },
        UI::Shell::{
            Common::{IObjectArray, IObjectCollection},
            DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW,
            PropertiesSystem::IPropertyStore,
            ShellLink,
        },
    },
};

use crate::common::consts::{
    ENCODED_EXECUTABLE_PATH, STRINGTABLE_JUMPLIST_NEW_TAB, STRINGTABLE_JUMPLIST_NEW_WINDOW,
};

#[derive(Clone, Copy)]
struct ShellLinkIcon {
    path: *const u16,
    index: i32,
}
impl ShellLinkIcon {
    fn new(path: *const u16, index: i32) -> Self {
        Self { path, index }
    }
}

fn new_shell_link(
    args: &[u16],
    title: &[u16],
    icon: ShellLinkIcon,
) -> Result<IShellLinkW, windows::core::Error> {
    unsafe {
        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;

        shell_link.SetPath(PCWSTR::from_raw(ENCODED_EXECUTABLE_PATH.as_ptr()))?;
        shell_link.SetArguments(PCWSTR::from_raw(args.as_ptr()))?;
        shell_link.SetIconLocation(PCWSTR::from_raw(icon.path), icon.index)?;

        let mut property_store_ptr = std::ptr::null_mut();
        shell_link
            .query(&IPropertyStore::IID, &mut property_store_ptr)
            .ok()?;
        let property_store = IPropertyStore::from_raw(property_store_ptr);

        property_store.SetValue(
            &PKEY_Title,
            &InitPropVariantFromStringAsVector(PCWSTR::from_raw(title.as_ptr()))?,
        )?;

        property_store.Commit()?;

        Ok(shell_link)
    }
}

fn new_encoded_indirect_string(path: impl Display, resource_index: u16) -> Vec<u16> {
    format!("@{},-{}", path, resource_index)
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<u16>>()
}

fn jumplist_tasks() -> Result<IObjectCollection, windows::core::Error> {
    let icon = ShellLinkIcon::new(ENCODED_EXECUTABLE_PATH.as_ptr(), 1);
    let current_exe = std::env::current_exe()?;

    unsafe {
        let collection: IObjectCollection =
            CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;

        collection.AddObject(&new_shell_link(
            &"--window"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<u16>>(),
            &new_encoded_indirect_string(current_exe.display(), STRINGTABLE_JUMPLIST_NEW_WINDOW),
            icon,
        )?)?;
        collection.AddObject(&new_shell_link(
            &"--tab"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<u16>>(),
            &new_encoded_indirect_string(current_exe.display(), STRINGTABLE_JUMPLIST_NEW_TAB),
            icon,
        )?)?;

        Ok(collection)
    }
}

pub fn update() -> Result<(), windows::core::Error> {
    unsafe {
        CoInitialize(None).and_then(|| {
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)
                .and_then(|jumplist: ICustomDestinationList| {
                    jumplist
                        .DeleteList(PCWSTR::from_raw(
                            "dev.tessapp"
                                .encode_utf16()
                                .chain(std::iter::once(0))
                                .collect::<Vec<u16>>()
                                .as_ptr(),
                        ))
                        .and(Ok(jumplist))
                })
                .and_then(|jumplist: ICustomDestinationList| {
                    jumplist.BeginList::<IObjectArray>(&mut 0).and(Ok(jumplist))
                })
                .and_then(|jumplist| {
                    jumplist_tasks()
                        .and_then(|tasks| jumplist.AddUserTasks(&tasks).and(Ok(jumplist)))
                })
                .and_then(|jumplist| jumplist.CommitList())
                .and(Ok(CoUninitialize()))
        })
    }
}
