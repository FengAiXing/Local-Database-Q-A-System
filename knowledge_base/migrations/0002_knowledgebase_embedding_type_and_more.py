# Generated by Django 5.2 on 2025-04-23 03:23

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("knowledge_base", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="knowledgebase",
            name="embedding_type",
            field=models.CharField(
                choices=[
                    ("remote", "远程嵌入(SiliconFlow)"),
                    ("local", "本地嵌入(Ollama)"),
                ],
                default="remote",
                help_text="选择使用远程API或本地Ollama进行嵌入",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="document",
            name="file_hash",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
