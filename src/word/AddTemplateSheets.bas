Attribute VB_Name = "FPPSheets"
Option Explicit

' AddTemplateSheets
' Adds FPP template sheets made by MakeFPPTemplates.jsx to the END of the open pattern document.
' Each sheet gets its own page: a title in the pattern's heading style (teal Gadugi), a one-line
' print note, and the picture at its exact printed size, centred on the page.
'
' Pick either one side's folder (e.g. "Middle Green Group - Left") or a folder that holds several
' of them; sub-folders are added in name order. Sizes and titles come from each folder's sheets.txt,
' so nothing needs typing.

Private Const TITLE_COLOR As Long = &H586325   ' RGB(37, 99, 88) - the template's teal
Private Const BOTTOM_RESERVE_IN As Double = 0.95 ' room kept for the footer
Private Const MIN_TOP_IN As Double = 1.3         ' picture must start below the title lines

Public Sub AddTemplateSheets()
    If Documents.Count = 0 Then
        MsgBox "Open your pattern document first, then run this again.", vbExclamation
        Exit Sub
    End If
    Dim doc As Document
    Set doc = ActiveDocument

    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFolderPicker)
    fd.Title = "Choose a sheets folder (e.g. 'Dark Blue - Left') or a folder holding several"
    If fd.Show <> -1 Then Exit Sub
    Dim root As String
    root = fd.SelectedItems(1)
    If Right$(root, 1) <> "\" Then root = root & "\"

    ' ---- which folders to add ----
    Dim folders() As String, nF As Long
    If Len(Dir(root & "sheets.txt")) > 0 Then
        nF = 1: ReDim folders(1 To 1): folders(1) = root
    Else
        ' list the sub-folders first (calling Dir inside a Dir loop would restart the listing)
        Dim d As String, subs0() As String, nS As Long, j As Long
        d = Dir(root & "*", vbDirectory)
        Do While Len(d) > 0
            If d <> "." And d <> ".." Then
                If (GetAttr(root & d) And vbDirectory) = vbDirectory Then
                    nS = nS + 1: ReDim Preserve subs0(1 To nS): subs0(nS) = d
                End If
            End If
            d = Dir()
        Loop
        For j = 1 To nS
            If Len(Dir(root & subs0(j) & "\sheets.txt")) > 0 Then
                nF = nF + 1: ReDim Preserve folders(1 To nF): folders(nF) = root & subs0(j) & "\"
            End If
        Next j
        If nF = 0 Then
            MsgBox "No sheets were found there." & vbCrLf & vbCrLf & _
                   "Choose a folder made by MakeFPPTemplates (it contains sheets.txt), " & _
                   "or the folder that holds those folders.", vbExclamation
            Exit Sub
        End If
        SortStrings folders, nF
    End If

    ' ---- read everything first, so nothing is added if something is wrong ----
    Dim i As Long, total As Long, summary As String
    Dim files() As String, titles() As String, subs() As String, widths() As Double, heights() As Double
    Dim fW As Double, fH As Double, n As Long, k As Long
    Dim pageH As Double
    pageH = doc.Sections(doc.Sections.Count).PageSetup.PageHeight / 72

    For i = 1 To nF
        Dim lines() As String
        lines = ReadLines(folders(i) & "sheets.txt")
        If UBound(lines) < 1 Then
            MsgBox "This list is empty or unreadable:" & vbCrLf & folders(i) & "sheets.txt", vbExclamation
            Exit Sub
        End If
        Dim parts() As String
        parts = Split(lines(0), vbTab)
        fW = Val(parts(1)): fH = Val(parts(2))
        If pageH - BOTTOM_RESERVE_IN - fH < MIN_TOP_IN Then
            MsgBox "The sheets in " & folders(i) & " are " & fH & " in tall, which is too tall for this page " & _
                   "with the header and footer. Nothing was added.", vbExclamation
            Exit Sub
        End If
        For k = 1 To UBound(lines)
            If Len(Trim$(lines(k))) > 0 Then
                parts = Split(lines(k), vbTab)
                If UBound(parts) >= 1 Then
                    If Len(Dir(folders(i) & parts(0))) = 0 Then
                        MsgBox "Missing picture: " & folders(i) & parts(0) & vbCrLf & "Nothing was added.", vbExclamation
                        Exit Sub
                    End If
                    n = n + 1
                    ReDim Preserve files(1 To n): ReDim Preserve titles(1 To n): ReDim Preserve subs(1 To n)
                    ReDim Preserve widths(1 To n): ReDim Preserve heights(1 To n)
                    files(n) = folders(i) & parts(0)
                    titles(n) = parts(1)
                    If UBound(parts) >= 2 Then subs(n) = parts(2) Else subs(n) = ""
                    widths(n) = fW: heights(n) = fH
                End If
            End If
        Next k
    Next i
    If n = 0 Then MsgBox "No sheets listed.", vbExclamation: Exit Sub

    If MsgBox("Add " & n & " page(s) to the end of """ & doc.Name & """?", vbOKCancel + vbQuestion) <> vbOK Then Exit Sub

    ' ---- add the pages ----
    Application.ScreenUpdating = False
    Dim warn As String
    For i = 1 To n
        warn = warn & AddSheetPage(doc, files(i), titles(i), subs(i), widths(i), heights(i))
    Next i
    Application.ScreenUpdating = True

    Dim msg As String
    msg = "Added " & n & " page(s)." & vbCrLf & vbCrLf & _
          "Print at Actual Size (File > Print: 'No Scaling', and no 'fit to page' in Printer Properties)."
    If Len(warn) > 0 Then
        msg = msg & vbCrLf & vbCrLf & "Warning: these pictures did not have the expected proportions " & _
              "and were stretched:" & warn
    End If
    MsgBox msg, vbInformation
End Sub

' Adds one page; returns a warning line if the picture's proportions looked wrong.
Private Function AddSheetPage(doc As Document, ByVal f As String, ByVal ttl As String, ByVal subTxt As String, _
                              ByVal wIn As Double, ByVal hIn As Double) As String
    Dim r As Range
    Set r = doc.Content
    r.Collapse wdCollapseEnd
    r.InsertBreak wdPageBreak

    ' title
    Set r = doc.Content
    r.Collapse wdCollapseEnd
    r.InsertAfter ttl
    With r.ParagraphFormat
        .SpaceBefore = 0: .SpaceAfter = 0: .LeftIndent = 0: .FirstLineIndent = 0
        .Alignment = wdAlignParagraphLeft: .PageBreakBefore = False
        .LineSpacingRule = wdLineSpaceSingle
    End With
    With r.Font
        .Name = "Gadugi": .Size = 16: .Bold = True: .Italic = False
        .Underline = wdUnderlineSingle: .Color = TITLE_COLOR
    End With
    Dim anchorPara As Range
    Set anchorPara = r.Paragraphs(1).Range

    ' print note
    If Len(subTxt) > 0 Then
        r.InsertParagraphAfter
        Dim r2 As Range
        Set r2 = doc.Content
        r2.Collapse wdCollapseEnd
        r2.InsertAfter subTxt
        With r2.Font
            .Name = "Gadugi": .Size = 10: .Bold = False: .Italic = True
            .Underline = wdUnderlineNone: .Color = TITLE_COLOR
        End With
        r2.ParagraphFormat.SpaceAfter = 0
    End If

    ' picture, positioned on the page so the header/footer and margins don't matter
    Dim shp As Shape, ratio As Double
    Set shp = doc.Shapes.AddPicture(FileName:=f, LinkToFile:=False, SaveWithDocument:=True, Anchor:=anchorPara)
    If shp.Height > 0 Then
        ratio = (shp.Width / shp.Height) / (wIn / hIn)
        If ratio < 0.99 Or ratio > 1.01 Then AddSheetPage = vbCrLf & f
    End If
    Dim ps As PageSetup
    Set ps = anchorPara.Sections(1).PageSetup
    With shp
        .LockAspectRatio = msoFalse
        .WrapFormat.Type = wdWrapBehind
        .RelativeHorizontalPosition = wdRelativeHorizontalPositionPage
        .RelativeVerticalPosition = wdRelativeVerticalPositionPage
        .Width = InchesToPoints(wIn)
        .Height = InchesToPoints(hIn)
        .Left = (ps.PageWidth - .Width) / 2
        .Top = ps.PageHeight - InchesToPoints(BOTTOM_RESERVE_IN) - .Height
        .LockAnchor = True
    End With
End Function

Private Function ReadLines(ByVal p As String) As String()
    Dim st As Object, txt As String
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "utf-8"
    st.Open
    st.LoadFromFile p
    txt = st.ReadText
    st.Close
    txt = Replace(txt, vbCrLf, vbLf)
    txt = Replace(txt, vbCr, vbLf)
    If Left$(txt, 1) = ChrW(&HFEFF) Then txt = Mid$(txt, 2)
    ReadLines = Split(txt, vbLf)
End Function

Private Sub SortStrings(a() As String, ByVal n As Long)
    Dim i As Long, j As Long, t As String
    For i = 2 To n
        t = a(i): j = i - 1
        Do While j >= 1
            If StrComp(a(j), t, vbTextCompare) <= 0 Then Exit Do
            a(j + 1) = a(j): j = j - 1
        Loop
        a(j + 1) = t
    Next i
End Sub
