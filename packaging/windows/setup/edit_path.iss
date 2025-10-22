procedure AppendToPath();
var
    AppDirectory: string;
    InitialPath: string;
    UpdatedPath: string;
begin
    AppDirectory := ExpandConstant('{app}');

    if not RegQueryStringValue(HKEY_LOCAL_MACHINE, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment', 'Path', InitialPath) then
        InitialPath := '';
    
    if Pos(AppDirectory, InitialPath) = 0 then
    begin
        if InitialPath <> '' then
            UpdatedPath := InitialPath + ';' + AppDirectory
        else
            UpdatedPath := AppDirectory;

        RegWriteStringValue(HKEY_LOCAL_MACHINE, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment', 'Path', UpdatedPath);
    end;
end;

procedure RemoveFromPath();
VAR
    AppDirectory: string;
    Path: string;
    PathLength: Integer;
begin
    AppDirectory := ExpandConstant('{app}');

    if not RegQueryStringValue(HKEY_LOCAL_MACHINE, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment', 'Path', Path) then
        exit;

    StringChangeEx(Path, AppDirectory, '', True);  
    StringChangeEx(Path, ';;', ';', True);

    PathLength := Length(Path);
    if (Pathlength > 0) and (Path[1] = ';') then
        Delete(Path, 1, 1);
    if (Pathlength > 0) and (Path[PathLength] = ';') then
        Delete(Path, PathLength, 1);

    RegWriteStringValue(HKEY_LOCAL_MACHINE, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment', 'Path', Path);
end;