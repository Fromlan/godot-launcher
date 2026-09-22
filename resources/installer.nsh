; 自定义 NSIS 安装/卸载钩子
; 卸载时清理数据目录(用户数据保留,仅移除快捷方式与注册表项)
!macro customInstall
  ; 创建开始菜单快捷方式分类(若需要)
  CreateDirectory "$SMPROGRAMS\Godot Launcher"
  CreateShortcut "$SMPROGRAMS\Godot Launcher\Godot Launcher.lnk" "$INSTDIR\Godot Launcher.exe" ""
!macroend

!macro customUnInstall
  ; 移除开始菜单快捷方式
  Delete "$SMPROGRAMS\Godot Launcher\Godot Launcher.lnk"
  RMDir "$SMPROGRAMS\Godot Launcher"
  ; 桌面快捷方式
  Delete "$DESKTOP\Godot Launcher.lnk"
!macroend
