package com.srikanthvvs1.financetracker.data

import android.content.ContentResolver
import android.net.Uri
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.ByteArrayInputStream
import java.time.LocalDate
import java.util.zip.ZipInputStream

data class WorkbookTable(val name: String, val headers: List<String>, val rows: List<Map<String, String>>)

class WorkbookValidationException(message: String) : Exception(message)

class XlsxReader(private val contentResolver: ContentResolver) {
    fun read(uri: Uri): Map<String, WorkbookTable> {
        val entries = mutableMapOf<String, ByteArray>()
        contentResolver.openInputStream(uri)?.use { input ->
            ZipInputStream(input).use { zip ->
                var entry = zip.nextEntry
                while (entry != null) {
                    if (!entry.isDirectory) entries[entry.name] = zip.readBytes()
                    zip.closeEntry()
                    entry = zip.nextEntry
                }
            }
        } ?: throw WorkbookValidationException("The selected workbook could not be opened.")

        val sharedStrings = entries["xl/sharedStrings.xml"]?.let(::parseSharedStrings).orEmpty()
        val relationships = entries["xl/_rels/workbook.xml.rels"]?.let(::parseRelationships)
            ?: throw WorkbookValidationException("Workbook relationships are missing.")
        val sheets = entries["xl/workbook.xml"]?.let(::parseWorkbook)
            ?: throw WorkbookValidationException("Workbook metadata is missing.")

        return sheets.associate { (name, relationshipId) ->
            val target = relationships[relationshipId]
                ?: throw WorkbookValidationException("Worksheet '$name' has no data relationship.")
            val normalized = when {
                target.startsWith("/") -> target.removePrefix("/")
                target.startsWith("xl/") -> target
                else -> "xl/${target.removePrefix("../")}"
            }
            val bytes = entries[normalized]
                ?: throw WorkbookValidationException("Worksheet '$name' data is missing.")
            name to parseSheet(name, bytes, sharedStrings)
        }
    }

    private fun parseSharedStrings(bytes: ByteArray): List<String> {
        val values = mutableListOf<String>()
        val parser = parser(bytes)
        var insideItem = false
        var text = StringBuilder()
        while (parser.eventType != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> {
                    if (parser.name == "si") {
                        insideItem = true
                        text = StringBuilder()
                    }
                    if (insideItem && parser.name == "t") text.append(parser.nextText())
                }
                XmlPullParser.END_TAG -> if (parser.name == "si") {
                    values += text.toString()
                    insideItem = false
                }
            }
            parser.next()
        }
        return values
    }

    private fun parseRelationships(bytes: ByteArray): Map<String, String> {
        val relationships = mutableMapOf<String, String>()
        val parser = parser(bytes)
        while (parser.eventType != XmlPullParser.END_DOCUMENT) {
            if (parser.eventType == XmlPullParser.START_TAG && parser.name == "Relationship") {
                val id = parser.getAttributeValue(null, "Id")
                val target = parser.getAttributeValue(null, "Target")
                if (id != null && target != null) relationships[id] = target
            }
            parser.next()
        }
        return relationships
    }

    private fun parseWorkbook(bytes: ByteArray): List<Pair<String, String>> {
        val sheets = mutableListOf<Pair<String, String>>()
        val parser = parser(bytes)
        while (parser.eventType != XmlPullParser.END_DOCUMENT) {
            if (parser.eventType == XmlPullParser.START_TAG && parser.name == "sheet") {
                val name = parser.getAttributeValue(null, "name")
                val relationshipId = parser.getAttributeValue(
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                    "id",
                ) ?: parser.getAttributeValue(null, "id")
                if (name != null && relationshipId != null) sheets += name to relationshipId
            }
            parser.next()
        }
        return sheets
    }

    private fun parseSheet(
        name: String,
        bytes: ByteArray,
        sharedStrings: List<String>,
    ): WorkbookTable {
        val rawRows = mutableListOf<Map<Int, String>>()
        val parser = parser(bytes)
        var currentRow = mutableMapOf<Int, String>()
        var cellColumn = -1
        var cellType: String? = null
        var cellValue = ""
        while (parser.eventType != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> when (parser.name) {
                    "row" -> currentRow = mutableMapOf()
                    "c" -> {
                        cellColumn = columnIndex(parser.getAttributeValue(null, "r").orEmpty())
                        cellType = parser.getAttributeValue(null, "t")
                        cellValue = ""
                    }
                    "v" -> cellValue = parser.nextText()
                    "t" -> if (cellType == "inlineStr") cellValue += parser.nextText()
                }
                XmlPullParser.END_TAG -> when (parser.name) {
                    "c" -> if (cellColumn >= 0) {
                        currentRow[cellColumn] = when (cellType) {
                            "s" -> sharedStrings.getOrNull(cellValue.toIntOrNull() ?: -1).orEmpty()
                            "b" -> if (cellValue == "1") "true" else "false"
                            else -> cellValue
                        }
                    }
                    "row" -> rawRows += currentRow.toMap()
                }
            }
            parser.next()
        }
        if (rawRows.isEmpty()) throw WorkbookValidationException("Worksheet '$name' is empty.")
        val maxColumn = rawRows.first().keys.maxOrNull() ?: -1
        val headers = (0..maxColumn).map { rawRows.first()[it].orEmpty().trim() }
        val rows = rawRows.drop(1).mapNotNull { row ->
            val mapped = headers.mapIndexedNotNull { index, header ->
                if (header.isBlank()) null else header to row[index].orEmpty()
            }.toMap()
            mapped.takeIf { values -> values.values.any(String::isNotBlank) }
        }
        return WorkbookTable(name, headers, rows)
    }

    private fun parser(bytes: ByteArray): XmlPullParser =
        XmlPullParserFactory.newInstance().newPullParser().apply {
            setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
            setInput(ByteArrayInputStream(bytes), "UTF-8")
        }

    private fun columnIndex(reference: String): Int {
        var result = 0
        reference.takeWhile(Char::isLetter).forEach { result = result * 26 + (it.uppercaseChar() - 'A' + 1) }
        return result - 1
    }

    companion object {
        fun excelDate(value: String): LocalDate {
            val numeric = value.toDoubleOrNull()
            return if (numeric != null) {
                LocalDate.of(1899, 12, 30).plusDays(numeric.toLong())
            } else {
                LocalDate.parse(value.take(10))
            }
        }
    }
}
