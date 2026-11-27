Attribute VB_Name = "TileDocBuilder"
Option Explicit

' BuildTileDocument
' Builds a US Letter Word document from a folder of exported tile PNGs:
' one tile per page, each picture set to the exact printed size.
' Pictures are sorted by name (A1, A2, ... A10, B1 ...).

Public Sub BuildTileDocument()
    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFolderPicker)
    fd.Title = "Choose the folder containing the exported tile PNGs"
    If fd.Show <> -1 Then Exit Sub

    Dim folderPath As String
    folderPath = fd.SelectedItems(1)
    If Right$(folderPath, 1) <> "\" Then folderPath = folderPath & "\"

    Dim sW As String, sH As String
    sW = InputBox("Tile width in inches (the same width you used in Illustrator):", "Tile width", "7")
    If Len(sW) = 0 Then Exit Sub
    sH = InputBox("Tile height in inches (the same height you used in Illustrator):", "Tile height", "8.5")
    If Len(sH) = 0 Then Exit Sub

    Dim tw As Double, th As Double
    tw = Val(sW)
    th = Val(sH)
    If tw <= 0 Or th <= 0 Then
        MsgBox "Please enter the tile size as numbers, for example 7.5 and 10.", vbExclamation
        Exit Sub
    End If
    If tw > 8 Or th > 10.3 Then
        MsgBox "A tile that big will not fit on US Letter paper with safe printer margins." & vbCrLf & _
               "The largest supported size is 8 x 10.3 inches.", vbExclamation
        Exit Sub
    End If

    ' ---- collect and sort the PNG file names ----
    Dim names() As String
    Dim n As Long, f As String
    f = Dir(folderPath & "*.png")
    Do While Len(f) > 0
        n = n + 1
        ReDim Preserve names(1 To n)
        names(n) = f
        f = Dir()
    Loop
    If n = 0 Then
        MsgBox "No PNG files were found in that folder.", vbExclamation
        Exit Sub
    End If

    Dim i As Long, j As Long, tmp As String
    For i = 2 To n
        tmp = names(i)
        j = i - 1
        Do While j >= 1
            If SortKey(names(j)) <= SortKey(tmp) Then Exit Do
            names(j + 1) = names(j)
            j = j - 1
        Loop
        names(j + 1) = tmp
    Next i

    ' ---- new US Letter document; margins centre the tile on the page ----
    Dim doc As Document
    Set doc = Documents.Add
    With doc.PageSetup
        .Orientation = wdOrientPortrait
        .PageWidth = InchesToPoints(8.5)
        .PageHeight = InchesToPoints(11)
        .LeftMargin = InchesToPoints((8.5 - tw) / 2)
        .RightMargin = InchesToPoints((8.5 - tw) / 2)
        .TopMargin = InchesToPoints((11 - th) / 2)
        ' bottom margin is 0.1 in smaller so the picture never spills onto a new page
        .BottomMargin = InchesToPoints((11 - th) / 2 - 0.1)
        .HeaderDistance = InchesToPoints(0.2)
        .FooterDistance = InchesToPoints(0.2)
    End With

    ' ---- one picture per page ----
    Dim para As Paragraph, rng As Range, shp As InlineShape
    Dim mismatches As String, ratio As Double
    For i = 1 To n
        If i > 1 Then doc.Content.InsertParagraphAfter
        Set para = doc.Paragraphs(doc.Paragraphs.Count)
        With para.Format
            .SpaceBefore = 0
            .SpaceAfter = 0
            .LeftIndent = 0
            .RightIndent = 0
            .FirstLineIndent = 0
            .LineSpacingRule = wdLineSpaceSingle
            .Alignment = wdAlignParagraphCenter
            .PageBreakBefore = (i > 1)
        End With
        para.Range.Font.Size = 1

        Set rng = para.Range
        rng.Collapse wdCollapseStart
        Set shp = doc.InlineShapes.AddPicture(FileName:=folderPath & names(i), _
                                              LinkToFile:=False, SaveWithDocument:=True, Range:=rng)
        If shp.Height > 0 Then
            ratio = (shp.Width / shp.Height) / (tw / th)
            If ratio < 0.99 Or ratio > 1.01 Then mismatches = mismatches & vbCrLf & names(i)
        End If
        shp.LockAspectRatio = msoFalse
        shp.Width = InchesToPoints(tw)
        shp.Height = InchesToPoints(th)
    Next i

    Dim msg As String
    msg = "Done: " & n & " tile(s), one per page, each " & tw & " x " & th & " inches." & vbCrLf & vbCrLf & _
          "Save the document, then print at Actual size (not 'Fit to page')."
    If Len(mismatches) > 0 Then
        msg = msg & vbCrLf & vbCrLf & "Warning: these pictures did not have the same proportions as the " & _
              "tile size you entered, so they were stretched. Check the size you typed:" & mismatches
    End If
    MsgBox msg, vbInformation
End Sub

' Turns "tile-A10.png" into a key where number runs are zero-padded,
' so A2 sorts before A10.
Private Function SortKey(ByVal s As String) As String
    Dim i As Long, ch As String, digits As String, res As String
    s = LCase$(s)
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            digits = digits & ch
        Else
            If Len(digits) > 0 Then
                res = res & Right$("0000" & digits, 4)
                digits = ""
            End If
            res = res & ch
        End If
    Next i
    If Len(digits) > 0 Then res = res & Right$("0000" & digits, 4)
    SortKey = res
End Function
