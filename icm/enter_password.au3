#cs

#ce

Send("{ENTER}")
Sleep(3500)
If WinExists("Connexion au token") Then
	Send("password_here")
    Sleep(2000)
EndIf
